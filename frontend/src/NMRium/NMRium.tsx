import ReactDOM from 'react-dom/client';
import { NMRium } from 'nmrium';

// 👇 Required UI and Blueprint layout styles
import 'normalize.css/normalize.css';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div style={{ height: '100vh', width: '100vw' }}>
    <NMRium />
  </div>,
);
