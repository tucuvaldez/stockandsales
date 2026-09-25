import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./auth";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{ duration: 4000, style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", fontSize: "14px" } }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
