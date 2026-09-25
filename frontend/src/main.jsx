import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="bottom-right" toastOptions={{ duration: 3500, style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", fontFamily: "'DM Sans', sans-serif", fontSize: "14px" } }} />
    </BrowserRouter>
  </React.StrictMode>
);
