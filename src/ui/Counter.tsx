import { useAgent } from "agents/react";
import { useEffect, useState } from "react";

const agentUrl = "wss://my-worker.example.com/agent/counter-agent/my-counter";

function Counter() {
  const [state, setState] = useState<{ counter: number }>({ counter: 0 });
  
  const agent = useAgent({
    agent: "counter-agent",
    name: "my-counter",
    onStateUpdate: (newState) => {
      console.log("Received new state from server:", newState);
      setState(newState as { counter: number });
    },
  });

  useEffect(() => {
    // Get initial state from the agent's call method
    agent.call('getState').then((initialState) => setState(initialState as { counter: number })).catch(() => {});
  }, [agent]);

  const handleIncrement = () => {
    agent.send(JSON.stringify({ op: "increment" }));
  };

  return (
    <div>
      <p>Count: {state.counter}</p>
      <button onClick={handleIncrement}>
        Increment
      </button>
    </div>
  );
}

export default Counter;