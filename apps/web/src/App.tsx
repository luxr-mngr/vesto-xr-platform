import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { Layout } from "./components/Layout.js";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Store } from "./pages/Store.js";
import { MyLibrary } from "./pages/MyLibrary.js";
import { ArtifactDetail } from "./pages/ArtifactDetail.js";
import { Admin } from "./pages/Admin.js";
import { Organizations } from "./pages/Organizations.js";
import { CustomFields } from "./pages/CustomFields.js";
import { ApiKeys } from "./pages/ApiKeys.js";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="store" element={<Store />} />
          <Route path="library" element={<MyLibrary />} />
          <Route path="artifacts/:id" element={<ArtifactDetail />} />
          <Route path="api-keys" element={<ApiKeys />} />
          <Route
            path="admin"
            element={
              <ProtectedRoute requireRole="admin">
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="custom-fields"
            element={
              <ProtectedRoute requireRole="admin">
                <CustomFields />
              </ProtectedRoute>
            }
          />
          <Route
            path="organizations"
            element={
              <ProtectedRoute requireRole="admin">
                <Organizations />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
