import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps> {
  constructor(props: ErrorBoundaryProps) {
    super(props);

    // Define a state variable to track whether is an error or not
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): { hasError: boolean } {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // You can use your own error logging service here
    console.log({ error, errorInfo });
  }

  render(): React.ReactNode {
    // Check if the error is thrown

    //@ts-ignore
    if (this?.state?.hasError) {
      // You can render any custom fallback UI
      return (
        <div>
          <h2>Oops, there is an error!</h2>
          <p>It&apos;s likely an issue with a corrupted deck/map/json.</p>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("DECKS");
                this.setState({ hasError: false });
              }}
            >
              Clear your decks
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem("MAP_LIST");
                this.setState({ hasError: false });
              }}
            >
              Clear your maps
            </button>
          </div>
          <p>
            If this doesn&apos;t fix: Right click &gt; Inspect &gt; Console to
            view the error.{" "}
          </p>
          <p>
            Copy/paste the console error and below data to the unbrewed discord
            or github for help.
          </p>

          <hr />
          <h3>Deck Local Storage</h3>
          <code
            style={{
              fontSize: "0.5rem",
              background: "lightgrey",
              padding: "4px",
              maxHeight: "500px",
              overflowY: "auto",
            }}
          >
            {localStorage.getItem("DECKS")}
          </code>
          <h3>Map Local Storage</h3>
          <code
            style={{
              fontSize: "0.5rem",
              background: "lightgrey",
              padding: "4px",
            }}
          >
            {localStorage.getItem("MAP_LIST")}
          </code>
        </div>
      );
    }

    // Return children components in case of no error
    return this.props.children;
  }
}

export default ErrorBoundary;
