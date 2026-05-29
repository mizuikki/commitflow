import OpenAI from 'openai';
import { ProviderProfile } from './provider-types';

type OpenAIClientConfig = {
  apiKey: string;
  baseURL?: string;
  defaultQuery?: { 'api-version': string };
  defaultHeaders?: Record<string, string>;
};

function createBaseOpenAIConfig(profile: ProviderProfile, apiKey?: string): OpenAIClientConfig {
  const resolvedApiKey = apiKey ?? 'not-required';

  switch (profile.driverKind) {
    case 'openai':
      return {
        apiKey: resolvedApiKey,
        baseURL: profile.connection?.baseURL
      };
    case 'azure-openai': {
      const endpoint = profile.connection?.endpoint;
      const deployment = profile.connection?.deployment;
      const apiVersion = profile.connection?.apiVersion;

      if (!endpoint || !deployment || !apiVersion) {
        throw new Error(`Azure OpenAI profile "${profile.name}" is missing endpoint, deployment, or API version.`);
      }

      const normalizedEndpoint = endpoint.replace(/\/+$/, '');
      return {
        apiKey: resolvedApiKey,
        baseURL: `${normalizedEndpoint}/openai/deployments/${deployment}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': resolvedApiKey }
      };
    }
    default:
      throw new Error(`Provider "${profile.name}" does not use an OpenAI client.`);
  }
}

export function createOpenAIClient(profile: ProviderProfile, apiKey?: string): OpenAI {
  return new OpenAI(createBaseOpenAIConfig(profile, apiKey));
}

export function createClientForModelListing(profile: ProviderProfile, apiKey?: string): OpenAI {
  if (profile.driverKind !== 'openai') {
    throw new Error(`Provider "${profile.name}" does not support OpenAI model listing.`);
  }

  return createOpenAIClient(profile, apiKey);
}
