# Unreal Engine Integration Guide

How an Unreal Engine project (or any external client — a VR visualizer, a different game engine, etc.) consumes VestoXR Manager's public API to list, download, and display GLB artifacts at runtime. This is the operational companion to [ERS.md](ERS.md) section 11 (Public/External API) — read that first for the contract's design rationale.

This guide covers the HTTP flow and a worked C++ example. It does not ship a packaged Unreal plugin — see "Open questions" at the end for what's still undecided.

---

## 1. Which auth mode do you need?

There are **two separate ways** to authenticate against the public API. Pick based on what your client needs to see:

| | **Org API key** | **Store user login** |
|---|---|---|
| Who it's for | A first-party integration acting on behalf of one organization | A read-only viewer client (e.g. a VR visualizer) used by many different people |
| What it sees | That organization's own artifacts (any status) **+** the public Store | **Only** the public Store — never anyone's private/draft work |
| Credential | A single API key, created once, shared by the whole client | Each user logs in with their own VestoXR email/password |
| Where the credential lives | Baked into the client/build | Entered by the person using the app; nothing long-lived to embed |

**If you're building a VR visualizer where any logged-in VestoXR user (any role) should be able to browse and download whatever's published in the Store** — use **Store user login** (§3 below). It doesn't require embedding a shared secret in a distributed client, and it's scoped to exactly the Store, nothing more. The org API key exists for a different case: a trusted integration that also needs to reach into one specific organization's not-yet-published work.

Both modes end up at the exact same download mechanism (§4) once you have a credential.

---

## 2. Base URL

```
https://<your-worker-subdomain>.workers.dev/v1/
```

(Or your custom API domain if one's been configured — see [DEPLOYMENT.md](DEPLOYMENT.md).) All endpoints below are relative to this base.

---

## 3. Auth mode A — Store user login (recommended for a VR visualizer)

Any **active** user — any role, any organization — can log in for a bearer token scoped to read-only Store access. This is a separate token from the web app's session cookie and from an org API key; it can only reach `/v1/store/*`, and it can never see the caller's own organization's private/draft artifacts, only what's actually published to the Store.

### `POST /v1/session/login`

```json
// Request body
{ "email": "someone@example.com", "password": "..." }
```

```json
// 200 response
{
  "token": "eyJzdWIiOi...",
  "expires_at": "2026-07-11T02:10:00.000Z",
  "user": { "id": "…", "email": "someone@example.com", "role": "curator", "organizationId": "…" }
}
```

- The token is valid for **7 days**.
- `401` for wrong email/password. `403` with `{ "status": "pending" | "disabled" }` if the account exists but isn't active yet.
- Rate-limited to 10 attempts/minute per source IP, same as the web app's login.
- Store this token securely on-device (e.g. Unreal's `SaveGame` system, encrypted if the platform supports it) and send it as `Authorization: Bearer <token>` on every request below. There's no logout/revoke endpoint for this token today — it simply expires after 7 days; a user changing their password does **not** invalidate tokens already issued (see "Open questions").

### `GET /v1/store/artifacts`

Lists every `published` + `public` artifact, from every organization. No query params yet (see "Open questions" in [ERS.md](ERS.md) §16).

### `GET /v1/store/artifacts/:id`

Same shape as one element above. `404` if the id doesn't exist or isn't Store-visible — including if it's the *caller's own* organization's still-unpublished artifact; this endpoint genuinely cannot see anything outside the Store.

### `GET /v1/store/artifacts/:id/download` / `GET /v1/store/artifacts/:id/thumbnail`

Same signed-URL pattern as the org-API-key flow — see §4.

---

## Auth mode B — Org API key (for a trusted, org-specific integration)

1. In the web app, an Admin or Curator opens **API Keys**, selects their organization, and creates a key. The raw key is shown **exactly once** — copy it into your client's config immediately (e.g. a `DefaultGame.ini` entry or a `Data Asset`, not committed to source control).
2. Send `Authorization: Bearer <raw_key>` on every request.
3. A key scopes what you can see: your **own organization's** artifacts (any status/visibility they hold) plus every organization's **published + public** artifacts (the shared Store). It cannot see another organization's private or draft artifacts.
4. Revoking a key (from the same API Keys screen) invalidates it immediately.

### `GET /v1/artifacts`, `GET /v1/artifacts/:id`, `GET /v1/artifacts/:id/download`, `GET /v1/artifacts/:id/thumbnail`

Same shapes and semantics as the `/v1/store/*` routes above, just with the broader own-org-plus-Store scope instead of Store-only.

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

### Rate limits (both auth modes)

`120 requests/minute per credential` (per API key, or per user token) across all of `/v1/*`. Exceeding it returns `429`. A polling/list-refresh loop should be well under this, but avoid looping the download endpoint per-frame or per-tick.

---

## 4. The two-step download flow, and why

Both auth modes above end at the same mechanism: the `/download` and `/thumbnail` endpoints never return file bytes directly. They return a short-lived signed URL:

```json
{
  "url": "https://<worker>/v1/download/eyJhbGciOi...",
  "expires_at": "2026-07-04T02:10:00.000Z"
}
```

```
┌──────────┐  1. GET /v1/store/artifacts/:id/download   ┌─────────┐
│  Client  │ ──────── Authorization: Bearer <token> ───▶ │  Worker │
│          │ ◀─────── { url, expires_at } ──────────────│         │
│          │                                              └─────────┘
│          │  2. GET <url>   (no auth header at all)     ┌─────────┐
│          │ ───────────────────────────────────────────▶│  Worker │
│          │ ◀──────────  raw .glb bytes ────────────────│  → R2   │
└──────────┘                                              └─────────┘
```

- The signed URL is valid for **10 minutes** from issuance and is scoped to that one artifact.
- `GET` it directly — **no `Authorization` header** on this second request; the token embedded in the URL is itself the credential.
- Fetch a fresh signed URL each time you need the bytes; don't cache the URL itself past its `expires_at`.
- Your long-lived credential (API key or 7-day user token) is never sent alongside the actual file bytes. If a signed URL leaks (logs, a proxy, a screen recording), it's useless after 10 minutes and only ever worked for one artifact — unlike a leaked long-lived credential, which needs to be revoked/rotated.

---

## 5. Loading the GLB in Unreal at runtime

Unreal has no built-in **runtime** glTF/GLB importer (the engine's own glTF support is editor-time only). The common community solution is the free, open-source **[glTFRuntime](https://github.com/rdeioris/glTFRuntime)** plugin, which loads a glTF/GLB from an in-memory byte buffer and spawns a mesh/skeletal mesh actor — a good fit here since we're downloading bytes over HTTP rather than reading from disk. Install it (Marketplace or from source) before following the example below; if you use a different runtime importer, only the last step (feeding it the byte buffer) changes.

### C++ example (Store user login)

```cpp
// VestoXRStoreClient.h
#pragma once
#include "CoreMinimal.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "VestoXRStoreClient.generated.h"

UCLASS()
class UVestoXRStoreClient : public UObject
{
    GENERATED_BODY()

public:
    // Call once per app session (or reuse a saved token — see "expires_at").
    void Login(const FString& ApiBaseUrl, const FString& Email, const FString& Password);

    // Call once logged in (bind to a delegate/event in your real code instead of chaining directly).
    void DownloadAndLoadArtifact(const FString& ArtifactId);

private:
    FString ApiBaseUrl;
    FString UserToken;

    void OnLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void RequestDownloadUrl(const FString& ArtifactId);
    void OnDownloadUrlResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void FetchGlbBytes(const FString& SignedUrl);
    void OnGlbBytesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
};
```

```cpp
// VestoXRStoreClient.cpp
#include "VestoXRStoreClient.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
// #include "glTFRuntimeFunctionLibrary.h"  // if using glTFRuntime

void UVestoXRStoreClient::Login(const FString& InApiBaseUrl, const FString& Email, const FString& Password)
{
    ApiBaseUrl = InApiBaseUrl;

    TSharedPtr<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("email"), Email);
    Body->SetStringField(TEXT("password"), Password);
    FString BodyString;
    FJsonSerializer::Serialize(Body.ToSharedRef(), TJsonWriterFactory<>::Create(&BodyString));

    TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(ApiBaseUrl + TEXT("/v1/session/login"));
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(BodyString);
    Request->OnProcessRequestComplete().BindUObject(this, &UVestoXRStoreClient::OnLoginResponse);
    Request->ProcessRequest();
}

void UVestoXRStoreClient::OnLoginResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        UE_LOG(LogTemp, Warning, TEXT("VestoXR: login failed (status %d)"),
            Response.IsValid() ? Response->GetResponseCode() : -1);
        return;
    }

    TSharedPtr<FJsonObject> Json;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());
    if (FJsonSerializer::Deserialize(Reader, Json) && Json.IsValid())
    {
        Json->TryGetStringField(TEXT("token"), UserToken);
        // Persist UserToken (e.g. to a SaveGame) so the user doesn't have to log in every launch,
        // and re-check "expires_at" before reusing it next session.
    }
}

void UVestoXRStoreClient::DownloadAndLoadArtifact(const FString& ArtifactId)
{
    RequestDownloadUrl(ArtifactId);
}

void UVestoXRStoreClient::RequestDownloadUrl(const FString& ArtifactId)
{
    const FString Url = FString::Printf(TEXT("%s/v1/store/artifacts/%s/download"), *ApiBaseUrl, *ArtifactId);

    TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(TEXT("GET"));
    Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *UserToken));
    Request->OnProcessRequestComplete().BindUObject(this, &UVestoXRStoreClient::OnDownloadUrlResponse);
    Request->ProcessRequest();
}

void UVestoXRStoreClient::OnDownloadUrlResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
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

void UVestoXRStoreClient::FetchGlbBytes(const FString& SignedUrl)
{
    // No Authorization header here — the token embedded in SignedUrl is the credential.
    TSharedRef<IHttpRequest> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(SignedUrl);
    Request->SetVerb(TEXT("GET"));
    Request->OnProcessRequestComplete().BindUObject(this, &UVestoXRStoreClient::OnGlbBytesResponse);
    Request->ProcessRequest();
}

void UVestoXRStoreClient::OnGlbBytesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
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

For the org-API-key mode, this is identical except `Login()` is skipped, `UserToken` is your raw API key entered once in config, and the download URL is requested from `/v1/artifacts/:id/download` instead of `/v1/store/artifacts/:id/download`.

Check glTFRuntime's actual current API (function names have shifted across versions) — the snippet above shows the shape of the call, not a guaranteed-current signature.

### Blueprint-only alternative

The same flow works from Blueprints using the engine's **HTTP Request** nodes (`Blueprint HTTP` plugin) plus `Get Json Object Field` to read `token`/`url` from each response. Wire the final binary response into whatever runtime-mesh-loading Blueprint function your chosen glTF plugin exposes (glTFRuntime exposes Blueprint-callable functions too).

---

## 6. Custom/archaeological metadata — current limitation

The `Artifact` shape returned by both `/v1/artifacts` and `/v1/store/artifacts` only exposes `id`, `organizationId`, `createdBy`, `title`, `status`, `visibility`, `glbR2Key`, and `thumbnailR2Key`. The fixed archaeological metadata fields described in [ERS.md](ERS.md) §8.1 (`site_name`, `culture_period`, `material`, etc.) and the admin-managed custom-field values (§8.2, editable today from Artifact Detail in the web app) are **not yet returned by either public-API artifact list** — that's a real gap in the current API, not something to build a workaround for on the client side. If your integration needs to facet/filter or display culture, period, or material, flag it so the API contract can be extended (a `/v1/store/artifacts/:id/custom-fields` endpoint, following the same auth pattern, would be the natural next step) rather than trying to scrape it another way.

---

## Open questions (surface, don't silently resolve)

Carried over from [ERS.md](ERS.md) §16 and [CLAUDE.md](../CLAUDE.md)'s "open items" list, plus a couple introduced by the Store-login mode — these affect how you'd build a production integration and haven't been decided:

1. **Offline/cached GLBs vs. always-live fetch.** This guide assumes always-live: fetch a fresh signed URL and download bytes every time. Whether the client should cache downloaded GLBs to disk (and how to invalidate that cache when an artifact is re-uploaded or unpublished) is undecided.
2. **No search/filter query params** on `/v1/artifacts` or `/v1/store/artifacts` yet (ERS §16 open question, Store-side too). A large catalog means downloading and filtering the full list client-side for now.
3. **No `GET /organizations/:slug` public org-profile endpoint** yet, despite being sketched in ERS §11 — so there's currently no way to resolve an artifact's `organizationId` to a human-readable organization name through the public API.
4. **No revoke/logout for a Store user token.** It's a bearer token good for 7 days once issued; there's no server-side list of issued tokens to invalidate individually, and changing your VestoXR password does not invalidate tokens already handed out. If a device is lost/compromised, the only current mitigation is waiting out the 7-day expiry (or rotating `JWT_SECRET`, which invalidates *every* session/token — API keys use a separate, database-backed revocation mechanism and aren't affected).
