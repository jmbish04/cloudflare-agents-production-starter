import React from 'react';
import { useAgentChat } from './useAgentChat';

interface ChatProps {
  instanceName?: string;
}

export function Chat({ instanceName = 'default-chat' }: ChatProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useAgentChat({
    agent: 'chat-history-agent',
    name: instanceName,
  });

  if (isLoading) {
    return <div className="chat-container">Loading chat history...</div>;
  }

  return (
    <div className="chat-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2>Chat History Demo</h2>
      
      <div 
        className="messages" 
        style={{ 
          height: '400px', 
          overflowY: 'auto', 
          border: '1px solid #ccc', 
          padding: '10px', 
          marginBottom: '20px',
          backgroundColor: '#f9f9f9'
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No messages yet. Start a conversation!</p>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              style={{ 
                marginBottom: '12px',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: message.role === 'user' ? '#e3f2fd' : 
                                message.role === 'assistant' ? '#f3e5f5' : '#fff3e0',
                borderLeft: `4px solid ${
                  message.role === 'user' ? '#2196f3' : 
                  message.role === 'assistant' ? '#9c27b0' : '#ff9800'
                }`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <strong style={{ textTransform: 'capitalize' }}>{message.role}</strong>
                <small style={{ color: '#666' }}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </small>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
            </div>
          ))
        )}
      </div>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder="Type your message..."
          style={{ 
            flex: 1, 
            padding: '10px', 
            border: '1px solid #ccc', 
            borderRadius: '4px',
            fontSize: '14px'
          }}
          disabled={isLoading}
        />
        <button 
          type="submit" 
          disabled={isLoading || !input.trim()}
          style={{
            padding: '10px 20px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !input.trim() ? 0.6 : 1,
            fontSize: '14px'
          }}
        >
          Send
        </button>
      </form>
      
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p><strong>Demo Features:</strong></p>
        <ul style={{ marginLeft: '20px' }}>
          <li>Real-time message synchronization via reactive state</li>
          <li>Persistent SQL-backed message history</li>
          <li>Atomic command-based updates</li>
          <li>Automatic scroll and timestamp display</li>
        </ul>
      </div>
    </div>
  );
}