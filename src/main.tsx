import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EchoScribeWeb from "../app/EchoScribeWeb";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EchoScribeWeb />
  </StrictMode>,
);
