# Unreal Engine Integration Guide

How an Unreal Engine project consumes VestoXR Manager's public API to list, download, and display GLB artifacts at runtime. This is the operational companion to [ERS.md](ERS.md) section 11 (Public/External API) — read that first for the contract's design rationale.

This guide covers the HTTP flow and a worked C++ example. It does not ship a packaged Unreal plugin — see "Open questions" at the end for what's still undecided.

---

## 1. Auth model

External clients (Unreal, or any other integration) authenticate with a **per-organization API key**, never with the session cookie the web app uses.

1. In the web app, an Admin or Curator opens **API Keys**, selects their organization, and creates a key. The raw key is shown **exactly once** — copy it into your Unreal project's config immediately (e.g. a `DefaultGame.ini` entry or a `Data Asset`, not committed to source control).
2. Every request to `/v1/*` must send:
   ```
   Authorization: Bearer <raw_key>
   ```
3. A key scopes what you can see: your **own organization's** artifacts (any status/visibility they hold) plus every organization's **published + public** artifacts (the shared Store). It cannot see another organization's private or draft artifacts.
4. Revoking a key (from the same API Keys screen) invalidates it immediately — the Worker checks `revoked_at` on every request, not just at issuance.

---

## 2. Base URL

```
https://<your-worker-subdomain>.workers.dev/v1/
```

(Or your custom API domain if one's been configured — see [DEPLOYMENT.md](DEPLOYMENT.md).) All endpoints below are relative to this base.

---

## 3. Endpoints

### `GET /v1/artifacts`

Lists every artifact your key can see (own-org, any status, plus other orgs' published+public items).

```json
[
  {
    "id": "ae84ced9-f30e-4939-b8c1-4a95e54f3d7d",
    "organizationId": "7bc5cb5c-94a1-467a-a0a6-c8def82e3189",
    "createdBy": "…",
    "title": "Botella - RN 13413",
    "status": "published",
    "visibility": "public",
    "glbR2Key": "7bc5cb5c…/ae84ced9…/model.glb",
    "thumbnailR2Key": "7bc5cb5c…/ae84ced9…/thumbnail.png"
  }
]
```

There is currently **no server-side search/filter** on this endpoint (no `q`, `culture_period`, `material`, etc. query params yet — see "Open questions"). Fetch the full list and filter client-side, or page through it yourself if your catalog grows large.

### `GET /v1/artifacts/:id`

Same shape as one element above. Returns `404` if the id doesn't exist or your key can't see it (cross-org private/draft artifacts look identical to "not found" — the API never reveals that a private artifact merely exists).

### `GET /v1/artifacts/:id/download`

Does **not** return the GLB bytes directly. It returns a short-lived signed URL:

```json
{
  "url": "https://<worker>/v1/download/eyJhbGciOi...",
  "expires_at": "2026-07-04T02:10:00.000Z"
}
```

- The token is valid for **10 minutes** from issuance.
- `GET` that `url` (no `Authorization` header needed — the token itself is the credential) to receive the raw `.glb` bytes, `Content-Type: model/gltf-binary`.
- Fetch a fresh signed URL each time you need the bytes; don't cache the URL itself past its `expires_at`.

### `GET /v1/artifacts/:id/thumbnail`

Identical pattern to `/download`, for the PNG preview image (`Content-Type: image/png`). Returns `404` if the artifact has no thumbnail yet.

### Rate limits

`120 requests/minute per API key` across all of `/v1/*`. Exceeding it returns `429`. A polling/list-refresh loop in your Unreal project should be well under this, but avoid looping the download endpoint per-frame or per-tick.

---

## 4. The two-step download flow, and why

```
┌──────────┐   1. GET /v1/artifacts/:id/download        ┌─────────┐
│  Unreal  │ ───────────  Authorization: Bearer <key> ─▶ │  Worker │
│  client  │ ◀──────────  { url, expires_at } ─────────  │         │
│          │                                              └─────────┘
│          │   2. GET <url>  (no auth header)            ┌─────────┐
│          │ ───────────────────────────────────────────▶│  Worker │
│          │ ◀──────────  raw .glb bytes ────────────────│  → R2   │
└──────────┘                                              └─────────┘
```

Your long-lived API key is never sent alongside the actual file bytes. Step 1 exchanges it for a narrowly-scoped, single-artifact, time-limited token; step 2 redeems that token for the bytes. If a signed URL leaks (logs, a proxy, a screen recording), it's useless after 10 minutes and only ever worked for one artifact — unlike a leaked API key, which would need to be revoked.

---

## 5. Loading the GLB in Unreal at runtime

Unreal has no built-in **runtime** glTF/GLB importer (the engine's own glTF support is editor-time only). The common community solution is the free, open-source **[glTFRuntime](https://github.com/rdeioris/glTFRuntime)** plugin, which loads a glTF/GLB from an in-memory byte buffer and spawns a mesh/skeletal mesh actor — a good fit here since we're downloading bytes over HTTP rather than reading from disk. Install it (Marketplace or from source) before following the example below; if you use a different runtime importer, only the last step (feeding it the byte buffer) changes.

### C++ example

```cpp
// VestoXRDownloader.h
#pragma once
#include "CoreMinimal.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "VestoXRDownloader.generated.h"

UCLASS()
class UVestoXRDownloader : public UObject
{
    GENERATED_BODY()

public:
    // Call this to fetch and spawn an artifact's GLB at runtime.
    void DownloadAndLoadArtifact(const FString& ApiBaseUrl, const FString& ApiKey, const FString& ArtifactId);

private:
    void RequestDownloadUrl(const FString& ApiBaseUrl, const FString& ApiKey, const FString& ArtifactId);
    void OnDownloadUrlResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void FetchGlbBytes(const FString& SignedUrl);
    void OnGlbBytesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
};
```

```cpp
// VestoXRDownloader.cpp
#include "VestoXRDownloader.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
// #include "glTFRuntimeFunctionLibrary.h"  // if using glTFRuntime

void UVestoXRDownloader::DownloadAndLoadArtifact(const FString& ApiBaseUrl, const FString& ApiKey, const FString& ArtifactId)
{
    RequestDownloadUrl(ApiBaseUrl, ApiKey, ArtifactId);
}

void UVestoXRDownloader::RequestDownloadUrl(const FString& ApiBaseUrl, const FString& ApiKey, const FString& ArtifactId)
{
    const FString Url = FString::Printf(TEXT("%s/v1/artifacts/%s/download"), *ApiBaseUrl, *ArtifactId);

    TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *ApiKey));
    Request->OnProcessRequestComplete().BindUObject(this, &UVestoXRDownloader::OnDownloadUrlResponse);
    Request->ProcessRequest();
}

void UVestoXRDownloader::OnDownloadUrlResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        UE_LOG(LogTemp, Warning, TEXT("VestoXR: failed to get a signed download URL (status %d)"),
            Response.IsValid() ? Response->GetResponseCode() : -1);
        return;
    }

    TSharedPtr<FJsonObject> Json;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    if (!FJsonSerializer::Deserialize(Reader, Json) || !Json.IsValid())
    {
        return;
    }

    FString SignedUrl;
    if (Json->TryGetStringField(TEXT("url"), SignedUrl))
    {
        FetchGlbBytes(SignedUrl);
    }
}

void UVestoXRDownloader::FetchGlbBytes(const FString& SignedUrl)
{
    // No Authorization header here — the token embedded in SignedUrl is the credential.
    TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(SignedUrl);
    Request->SetVerb(TEXT("GET"));
    Request->OnProcessRequestComplete().BindUObject(this, &UVestoXRDownloader::OnGlbBytesResponse);
    Request->ProcessRequest();
}

void UVestoXRDownloader::OnGlbBytesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        UE_LOG(LogTemp, Warning, TEXT("VestoXR: failed to download GLB bytes (status %d)"),
            Response.IsValid() ? Response->GetResponseCode() : -1);
        return;
    }

    const TArray<uint8>& GlbBytes = Response->GetContent();

    // --- glTFRuntime example (uncomment if you've installed the plugin) ---
    // FglTFRuntimeConfig LoaderConfig;
    // UglTFRuntimeAsset* Asset = UglTFRuntimeFunctionLibrary::glTFLoadAssetFromData(GlbBytes, LoaderConfig);
    // if (Asset)
    // {
    //     // e.g. spawn a static/skeletal mesh actor from Asset here.
    // }

    UE_LOG(LogTemp, Log, TEXT("VestoXR: downloaded %d bytes of GLB data"), GlbBytes.Num());
}
```

Check glTFRuntime's actual current API (function names have shifted across versions) — the snippet above shows the shape of the call, not a guaranteed-current signature.

### Blueprint-only alternative

The same two-step flow works from Blueprints using the engine's **HTTP Request** nodes (`Blueprint HTTP` plugin) plus `Get Json Object Field` to read `url` from the first response. Wire the second request's binary response into whatever runtime-mesh-loading Blueprint function your chosen glTF plugin exposes (glTFRuntime exposes Blueprint-callable functions too).

---

## 6. Custom/archaeological metadata — current limitation

The public API's `Artifact` shape (§3 above) only exposes `id`, `organizationId`, `createdBy`, `title`, `status`, `visibility`, `glbR2Key`, and `thumbnailR2Key`. The fixed archaeological metadata fields described in [ERS.md](ERS.md) §8.1 (`site_name`, `culture_period`, `material`, etc.) and the admin-managed custom-field values (§8.2, editable today from Artifact Detail in the web app) are **not yet returned by `/v1/artifacts`** — that's a real gap in the current API, not something to build a workaround for on the Unreal side. If your integration needs to facet/filter by culture, period, or material, flag it so the API contract can be extended (`/v1/artifacts/:id/custom-fields` following the same Bearer-auth pattern as the rest of `/v1/*` would be the natural next step) rather than trying to scrape it another way.

---

## Open questions (surface, don't silently resolve)

Carried over from [ERS.md](ERS.md) §16 and [CLAUDE.md](../CLAUDE.md)'s "open items" list — these affect how you'd build a production Unreal integration and haven't been decided:

1. **Offline/cached GLBs vs. always-live fetch.** This guide assumes always-live: fetch a fresh signed URL and download bytes every time. Whether the Unreal side should cache downloaded GLBs to disk (and how to invalidate that cache when an artifact is re-uploaded or unpublished) is undecided.
2. **No search/filter query params** on `/v1/artifacts` yet (ERS §16 open question, Store-side too). A large catalog means downloading and filtering the full list client-side for now.
3. **No `GET /organizations/:slug` public org-profile endpoint** yet, despite being sketched in ERS §11 — so there's currently no way to resolve an artifact's `organizationId` to a human-readable organization name through the public API.
