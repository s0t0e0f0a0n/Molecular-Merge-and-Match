import { Layout } from './components/Layout';
import { RDKitProvider } from './context/RDKitContext';
import { MolecularBookkeepingPage } from './features/layout/MolecularBookkeepingPage';
import { WarningProvider } from './context/WarningContext'

export default function App() {
  return (
    <RDKitProvider>
    <WarningProvider>
      <Layout>
        <MolecularBookkeepingPage />
      </Layout>
    </WarningProvider>
    </RDKitProvider>
  );
}
