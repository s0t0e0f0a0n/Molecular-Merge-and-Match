import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css' //kan ik hier globale dark/light theme dingen in doen?
import App from './App'
import { ExerciseDataProvider } from './context/ExerciseDataContext'
import { HistoryProvider } from './context/HistoryContext'

if (import.meta.env.PROD) {
  // Save a reference to the browser's original fetch function
  const originalFetch = window.fetch;

  // Override the global fetch
  window.fetch = async (input, init) => {
    let url = input;
    
    // If the request is for our backend, prepend the 'api://' protocol
    if (typeof url === 'string' && (url.startsWith('/api/v1') || url.startsWith('/uploads'))) {
      // Use a dummy host 'backend' so the URL parser doesn't swallow the first path segment
      url = `api://backend${url}`;
    }
    
    // Call the original fetch with the newly formatted URL
    return originalFetch(url, init);
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExerciseDataProvider> {/* The exercise data provider is not part of App.tsx, to be able to test with mock data */}
      <HistoryProvider>
        <App />
      </HistoryProvider>
    </ExerciseDataProvider>
  </React.StrictMode>
)
