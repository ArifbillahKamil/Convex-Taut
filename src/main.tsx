import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import App from "./App";
import "./style.css";

const url = import.meta.env.VITE_CONVEX_URL;
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="setup">
        <h1>A little interruption.</h1>
        <p>We could not open your space. Check your connection and reload.</p>
        <button onClick={() => location.reload()}>Try again</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {url ? (
        <ConvexAuthProvider client={new ConvexReactClient(url)}>
          <App />
        </ConvexAuthProvider>
      ) : (
        <main className="setup">
          <h1>Taut</h1>
          <p>
            The workspace needs a Convex connection. Run the development setup,
            then restart the app.
          </p>
        </main>
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
