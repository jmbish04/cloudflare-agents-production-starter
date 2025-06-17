import { useAgent } from "../hooks/useAgent";
import { useEffect, useState } from "react";

interface HITLState {
  status: "idle" | "pending_review" | "running" | "aborted" | "completed";
  data: any;
}

interface InterventionProps {
  agentId: string;
}

function Intervention({ agentId }: InterventionProps) {
  const [state, setState] = useState<HITLState>({ status: "idle", data: null });
  const [error, setError] = useState<string | null>(null);
  const [overrideData, setOverrideData] = useState<string>("");
  
  const agent = useAgent({
    agent: "hitl-agent",
    name: agentId,
    onMessage: (message) => {
      try {
        const parsed = JSON.parse(message);
        
        if (parsed.type === "state_update") {
          setState(parsed.state);
          setError(null);
        } else if (parsed.type === "error") {
          setError(parsed.message);
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    },
  });

  const sendCommand = (op: string, newData?: any) => {
    const command = { op, ...(newData && { newData }) };
    agent.send(JSON.stringify(command));
  };

  const handleProceed = () => {
    sendCommand("proceed");
  };

  const handleOverride = () => {
    try {
      const newData = overrideData ? JSON.parse(overrideData) : undefined;
      sendCommand("override", newData);
    } catch (e) {
      setError("Invalid JSON in override data");
    }
  };

  const handleAbort = () => {
    sendCommand("abort");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "idle": return "#6c757d";
      case "pending_review": return "#ffc107";
      case "running": return "#007bff";
      case "completed": return "#28a745";
      case "aborted": return "#dc3545";
      default: return "#6c757d";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "idle": return "Idle";
      case "pending_review": return "⏳ Pending Review";
      case "running": return "🔄 Running";
      case "completed": return "✅ Completed";
      case "aborted": return "❌ Aborted";
      default: return status;
    }
  };

  const isReviewable = state.status === "pending_review";

  return (
    <div style={{ 
      fontFamily: "system-ui, -apple-system, sans-serif", 
      maxWidth: "600px", 
      margin: "2rem auto", 
      padding: "1rem" 
    }}>
      <div style={{
        background: "#f8f9fa",
        padding: "2rem",
        borderRadius: "8px",
        border: "1px solid #e9ecef"
      }}>
        <h1>🔍 Human-in-the-Loop Intervention</h1>
        
        <div style={{ marginBottom: "1rem" }}>
          <strong>Agent ID:</strong> <code>{agentId}</code>
        </div>
        
        <div style={{ 
          marginBottom: "1rem",
          padding: "0.5rem",
          borderRadius: "4px",
          backgroundColor: getStatusColor(state.status) + "20",
          border: `1px solid ${getStatusColor(state.status)}40`
        }}>
          <strong>Status:</strong> <span style={{ color: getStatusColor(state.status) }}>
            {getStatusText(state.status)}
          </span>
        </div>

        {error && (
          <div style={{
            background: "#f8d7da",
            color: "#721c24",
            padding: "0.75rem",
            borderRadius: "4px",
            marginBottom: "1rem",
            border: "1px solid #f5c6cb"
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {state.data && (
          <div style={{ marginBottom: "1rem" }}>
            <strong>Task Data:</strong>
            <pre style={{
              background: "#e9ecef",
              padding: "1rem",
              borderRadius: "4px",
              overflow: "auto",
              fontSize: "0.875rem"
            }}>
              {JSON.stringify(state.data, null, 2)}
            </pre>
          </div>
        )}

        {isReviewable && (
          <div>
            <h2>Review Actions</h2>
            <p>The agent is waiting for your review. Choose an action:</p>
            
            <div style={{ marginBottom: "1rem" }}>
              <button
                onClick={handleProceed}
                style={{
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  marginRight: "0.5rem",
                  cursor: "pointer"
                }}
              >
                ✅ Proceed
              </button>
              
              <button
                onClick={handleAbort}
                style={{
                  background: "#dc3545",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                ❌ Abort
              </button>
            </div>
            
            <div>
              <h3>Override Data</h3>
              <p>Optionally modify the task data before proceeding:</p>
              <textarea
                value={overrideData}
                onChange={(e) => setOverrideData(e.target.value)}
                placeholder="Enter JSON data to override (optional)"
                style={{
                  width: "100%",
                  height: "100px",
                  padding: "0.5rem",
                  border: "1px solid #ced4da",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  fontSize: "0.875rem"
                }}
              />
              <button
                onClick={handleOverride}
                style={{
                  background: "#ffc107",
                  color: "#212529",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  marginTop: "0.5rem",
                  cursor: "pointer"
                }}
              >
                🔄 Override & Proceed
              </button>
            </div>
          </div>
        )}

        {!isReviewable && (
          <div style={{
            background: "#e2e3e5",
            padding: "1rem",
            borderRadius: "4px",
            color: "#6c757d"
          }}>
            {state.status === "idle" && "Agent is idle. No intervention needed."}
            {state.status === "running" && "Agent is currently running. Please wait..."}
            {state.status === "completed" && "Task completed successfully."}
            {state.status === "aborted" && "Task was aborted."}
          </div>
        )}
      </div>
    </div>
  );
}

export default Intervention;