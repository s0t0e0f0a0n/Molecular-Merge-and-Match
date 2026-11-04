import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './installApiFetch'
import App from './App'
import { ExerciseDataProvider } from './context/ExerciseDataContext'
import { HistoryProvider } from './context/HistoryContext'

window.addEventListener('keydown', (event) => {
  if (window.location.protocol !== 'file:' && event.key === 'F2') {
    event.preventDefault();
    window.open('/NMRium.html', 'nmrium');
  }
  if (window.location.protocol !== 'file:' && event.key === 'F8') {
    event.preventDefault();
    window.open('/NMRiumF8.html', 'nmrium-f8');
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ExerciseDataProvider> {/* The exercise data provider is not part of App.tsx, to be able to test with mock data */}
      <HistoryProvider>
        <App />
      </HistoryProvider>
    </ExerciseDataProvider>
  </React.StrictMode>
)
