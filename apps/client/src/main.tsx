import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ConfirmProvider } from "./confirm-dialog.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ConfirmProvider><App /></ConfirmProvider></StrictMode>);
