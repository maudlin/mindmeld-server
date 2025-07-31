# MindMeld Server Integration Guide for Client Team

## 🎯 **Integration Overview**

The MindMeld server provides a RESTful API for state persistence with backward compatibility. This guide helps the client team integrate with the production-ready server.

## 🚀 **Quick Start Integration**

### **1. Server Setup**
```bash
# Clone and start the server
git clone https://github.com/maudlin/mindmeld-server.git
cd mindmeld-server
npm install
npm start

# Server runs on http://localhost:3001
# Health check: GET http://localhost:3001/health
```

### **2. Client Configuration**
Update your client's API base URL:
```javascript
// In your client configuration
const API_BASE_URL = 'http://localhost:3001/api';

// For production
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
```

## 📡 **API Integration Points**

### **State Loading (GET /api/state)**
```javascript
// Load mind map state on app initialization
async function loadMindMapState() {
  try {
    const response = await fetch(`${API_BASE_URL}/state`);
    const state = await response.json();
    
    // State structure:
    // {
    //   notes: [{ id, content, left, top, ... }],
    //   connections: [{ from, to }],
    //   zoomLevel: number
    // }
    
    return state;
  } catch (error) {
    console.error('Failed to load state:', error);
    // Return empty state as fallback
    return { notes: [], connections: [], zoomLevel: 5 };
  }
}
```

### **State Saving (PUT /api/state)**
```javascript
// Save mind map state (debounced for performance)
const saveState = debounce(async (state) => {
  try {
    const response = await fetch(`${API_BASE_URL}/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state)
    });
    
    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('State saved:', result);
    // result: { success: true, notes: 5, connections: 3, timestamp: "..." }
    
  } catch (error) {
    console.error('Failed to save state:', error);
    // Handle error (show user notification, retry, etc.)
  }
}, 1000); // Debounce saves to prevent spam

// Usage: call saveState(currentState) whenever state changes
```

### **Health Monitoring (GET /health)**
```javascript
// Check server health (optional - for monitoring)
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
    const health = await response.json();
    
    // Health structure:
    // {
    //   status: "ok",
    //   uptime: 123.45,
    //   stats: { notesCount: 5, connectionsCount: 3, isEmpty: false }
    // }
    
    return health;
  } catch (error) {
    console.warn('Server health check failed:', error);
    return { status: 'unavailable' };
  }
}
```

## 🔧 **Integration Patterns**

### **1. Auto-Save Implementation**
```javascript
// Example React hook for auto-save
function useMindMapPersistence() {
  const [state, setState] = useState({ notes: [], connections: [], zoomLevel: 5 });
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving', 'saved', 'error'

  // Load initial state
  useEffect(() => {
    loadMindMapState().then(setState);
  }, []);

  // Auto-save on state changes
  useEffect(() => {
    if (state.notes.length > 0 || state.connections.length > 0) {
      setSaveStatus('saving');
      saveState(state)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));
    }
  }, [state]);

  return { state, setState, saveStatus };
}
```

### **2. Error Handling Strategy**
```javascript
// Robust error handling with retry
async function saveStateWithRetry(state, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await saveState(state);
      return; // Success
    } catch (error) {
      if (attempt === maxRetries) {
        // Final attempt failed - show user error
        showNotification('Failed to save changes. Please check your connection.', 'error');
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

### **3. Optimistic Updates**
```javascript
// Update UI immediately, sync with server in background
function updateNoteOptimistically(noteId, newContent) {
  // 1. Update UI immediately
  setNotes(prev => prev.map(note => 
    note.id === noteId ? { ...note, content: newContent } : note
  ));
  
  // 2. Save to server in background
  const newState = { ...currentState, notes: updatedNotes };
  saveState(newState).catch(error => {
    // If save fails, optionally revert UI or show error
    console.error('Failed to save note update:', error);
  });
}
```

## ⚡ **Performance Recommendations**

### **1. Debounced Saves**
```javascript
// Prevent excessive API calls during rapid editing
const debouncedSave = debounce(saveState, 1000);

// Use in event handlers
function handleNoteChange(noteId, content) {
  updateNoteInState(noteId, content);
  debouncedSave(getCurrentState());
}
```

### **2. State Validation (Client-Side)**
```javascript
// Validate state before sending to prevent server errors
function validateState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('State must be an object');
  }
  
  if (!Array.isArray(state.notes)) {
    throw new Error('State must have notes array');
  }
  
  if (!Array.isArray(state.connections)) {
    throw new Error('State must have connections array');
  }
  
  if (typeof state.zoomLevel !== 'number') {
    throw new Error('State must have numeric zoomLevel');
  }
  
  // Validate notes structure
  state.notes.forEach((note, index) => {
    if (!note.id) throw new Error(`Note ${index} missing id`);
    if (typeof note.content !== 'string') throw new Error(`Note ${index} missing content`);
  });
  
  // Validate connections
  state.connections.forEach((conn, index) => {
    if (!conn.from || !conn.to) throw new Error(`Connection ${index} missing from/to`);
  });
  
  return true;
}
```

## 🔄 **CORS Configuration**

The server is configured for CORS. For development:
```javascript
// Client runs on http://localhost:8080 (default CORS origin)
// Server runs on http://localhost:3001

// If your client runs on a different port, set environment variable:
// CORS_ORIGIN=http://localhost:3000 npm start
```

## 🚦 **Development Workflow**

### **1. Local Development Setup**
```bash
# Terminal 1: Start server
cd mindmeld-server
npm run dev  # Auto-reload on changes

# Terminal 2: Start client
cd mindmeld-client
npm start    # Your existing client startup
```

### **2. Testing Integration**
```bash
# Test server endpoints manually
curl http://localhost:3001/health
curl http://localhost:3001/api/state
curl -X PUT http://localhost:3001/api/state -H "Content-Type: application/json" -d '{"notes":[],"connections":[],"zoomLevel":5}'
```

## 📊 **Monitoring & Debugging**

### **1. Client-Side Logging**
```javascript
// Add logging for integration debugging
const api = {
  async saveState(state) {
    console.log('Saving state:', { notesCount: state.notes.length, connectionsCount: state.connections.length });
    const result = await saveState(state);
    console.log('Save result:', result);
    return result;
  },
  
  async loadState() {
    console.log('Loading state...');
    const state = await loadMindMapState();
    console.log('Loaded state:', { notesCount: state.notes.length, connectionsCount: state.connections.length });
    return state;
  }
};
```

### **2. Server Status Indicator** (Optional)
```javascript
// Add server status to your UI
function ServerStatusIndicator() {
  const [health, setHealth] = useState(null);
  
  useEffect(() => {
    const checkHealth = () => checkServerHealth().then(setHealth);
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className={`server-status ${health?.status === 'ok' ? 'online' : 'offline'}`}>
      Server: {health?.status || 'checking...'}
    </div>
  );
}
```

## 🐛 **Common Issues & Solutions**

### **CORS Errors**
```bash
# If you see CORS errors, check server environment:
CORS_ORIGIN=http://localhost:YOUR_CLIENT_PORT npm start
```

### **Save Failures**
- Check browser network tab for HTTP status codes
- Common causes: malformed JSON, validation errors, network issues
- Server validation errors return 400 with detailed messages

### **State Loading Issues**
- Server returns empty state `{notes: [], connections: [], zoomLevel: 5}` if no data exists - this is normal
- Check server logs: `npm run dev` shows detailed logging
- Verify server is running: `curl http://localhost:3001/health`

### **Performance Issues**
- Implement debounced saves to prevent API spam
- Use optimistic updates for better UX
- Consider client-side validation before server requests

## 📋 **Integration Checklist**

- [ ] **Server running** on http://localhost:3001
- [ ] **Client configured** with correct API_BASE_URL
- [ ] **CORS configured** for your client port
- [ ] **State loading** implemented on app init
- [ ] **State saving** implemented with debouncing
- [ ] **Error handling** implemented with user feedback
- [ ] **Validation** added to prevent bad requests
- [ ] **Testing** completed with sample data
- [ ] **Monitoring** added for server health (optional)

## 🔗 **API Reference Summary**

| Endpoint | Method | Purpose | Request | Response |
|----------|--------|---------|---------|----------|
| `/health` | GET | Server health check | - | `{status, uptime, stats}` |
| `/api/state` | GET | Load current state | - | `{notes[], connections[], zoomLevel}` |
| `/api/state` | PUT | Save state | `{notes[], connections[], zoomLevel}` | `{success, timestamp, stats}` |
| `/api/state/stats` | GET | Get state statistics | - | `{notesCount, connectionsCount, zoomLevel, isEmpty}` |

## 🆘 **Need Help?**

- **Server Documentation**: See `README.md` and `docs/architecture.md`
- **API Issues**: Check server logs with `npm run dev`
- **Integration Problems**: Test endpoints manually with curl/Postman
- **CORS Issues**: Verify CORS_ORIGIN environment variable

---

**Ready to integrate?** Start with the Quick Start section and work through the checklist. The server maintains full backward compatibility with your existing state structure.