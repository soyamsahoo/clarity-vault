import type { SimulationMeta } from '@clarity/types';
import { API_VERSION, SIMULATION_DISCLAIMER } from '@clarity/types';

export const SIMULATION = true;

export function isSimulationAuth(): boolean {
  return !process.env.CLERK_SECRET_KEY;
}

export function simulationMeta(): SimulationMeta {
  return {
    simulation: true,
    disclaimer: SIMULATION_DISCLAIMER,
    integrations: {
      accountAggregator: 'SIMULATED',
      universityCosts: 'SIMULATED',
      lenderQuotes: 'SIMULATED',
      kyc: 'SIMULATED',
      clerkAuth: process.env.CLERK_SECRET_KEY ? 'CLERK' : 'SIMULATED_DEMO',
    },
    version: API_VERSION,
    serverTime: new Date().toISOString(),
  };
}

export const DISCLAIMERS = {
  underwriting:
    'Indicative policy match only. No lender has evaluated this application. A real sanction depends on bureau checks, income verification, collateral and lender discretion.',
  risk:
    'Monte-Carlo outputs are probabilistic illustrations, not predictions. They use simulated placement distributions and assumptions that will differ from your real career.',
  certificate:
    'This Cost Certainty Certificate records the cost evidence available on its issue date. It is not a guarantee that future fees will not change, nor a loan sanction.',
  kyc: 'KYC is simulated for this prototype. A real deployment must use a SEBI/RBI-regulated KYC provider with encrypted PII storage.',
  aa: 'Account Aggregator consent is simulated. A real deployment must integrate an RBI-licensed AA (e.g. Setu, Finvu), store consent artefacts and honour revocation.',
} as const;
