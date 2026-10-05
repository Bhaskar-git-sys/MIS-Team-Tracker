import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { PresenceProvider } from "./contexts/PresenceContext";
import App from "./App";
import "./styles/index.css";
import { recordBossIncident } from "./services/bossAIService";

window.addEventListener("error", (event) => {
  void recordBossIncident({
    message: event.message || "Unhandled frontend error",
    stack: event.error?.stack,
    component: "window.error",
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  void recordBossIncident({ message: reason.message, stack: reason.stack, component: "unhandledrejection" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <PresenceProvider>
              <App />
            </PresenceProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
