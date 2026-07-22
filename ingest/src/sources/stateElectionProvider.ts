import { SourcePayload, SourcePayloadSchema } from '../schema.js';

export type StateElectionCapability = 'filedCandidates' | 'certifiedCandidates' | 'governorRaces' | 'statewideMeasures' | 'officialText' | 'fiscalAnalysis';

export type StateElectionProvider = {
  id: string;
  state: string;
  label: string;
  officialBaseUrl: string;
  capabilities: StateElectionCapability[];
  load(year: number): Promise<SourcePayload>;
};

const providers = new Map<string, StateElectionProvider>();

export function registerStateElectionProvider(provider: StateElectionProvider) {
  const state = provider.state.toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error(`Invalid provider state: ${provider.state}`);
  if (!provider.officialBaseUrl.startsWith('https://')) throw new Error(`Provider ${provider.id} must use an HTTPS official source.`);
  if (providers.has(state)) throw new Error(`A state election provider is already registered for ${state}.`);
  providers.set(state, { ...provider, state });
}

export function getStateElectionProvider(state: string) {
  return providers.get(state.toUpperCase()) ?? null;
}

export function listStateElectionProviders() {
  return Array.from(providers.values()).sort((a, b) => a.state.localeCompare(b.state));
}

/**
 * Registers a read-only official JSON endpoint that already emits the project's
 * SourcePayload shape. State-specific adapters can replace this when an office
 * publishes a different schema.
 */
export function registerOfficialJsonProvider(config: Omit<StateElectionProvider, 'load'> & { endpoint: string }) {
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:') throw new Error(`Provider ${config.id} endpoint must use HTTPS.`);
  registerStateElectionProvider({
    ...config,
    async load(year) {
      const url = new URL(endpoint);
      url.searchParams.set('year', String(year));
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`${config.label} returned ${response.status}`);
      const payload = SourcePayloadSchema.parse(await response.json());
      const refreshedAt = new Date().toISOString();
      const sourceDefaults = {
        source: config.label,
        sourceUrl: url.toString(),
        lastRefreshedAt: refreshedAt,
        refreshStatus: 'fresh' as const,
        verificationLevel: 'official' as const,
      };
      return {
        races: payload.races.map((race) => ({
          ...sourceDefaults,
          ...race,
          candidates: race.candidates.map((candidate) => ({ ...sourceDefaults, ...candidate })),
        })),
        ballotMeasures: payload.ballotMeasures.map((measure) => ({ ...sourceDefaults, ...measure })),
      };
    },
  });
}
