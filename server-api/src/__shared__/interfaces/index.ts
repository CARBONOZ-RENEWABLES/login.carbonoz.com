export interface IAppConfig {
  port?: number;
  databaseUrl: string;
  env?: any;
  jwt?: JwtConfig;
  swaggerEnabled?: boolean;
  redex?: IRedexConfig;
  frontedUrl: string;
  backendUrl: string;
  admin: amdinConfig;
  smtp?: SmtpConfig;
  googleClientId?: string;
  googleClientSecret?: string;
  appleClientId?: string;
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  legacyAuthEnabled?: boolean;
  keycloak?: KeycloakConfig;
  session?: SessionConfig;
  machineAuth?: MachineAuthConfig;
  solar?: SolarConfig;
  ingestBridge?: IngestBridgeConfig;
}

export interface KeycloakConfig {
  enabled: boolean;
  /** e.g. https://auth.carbonoz.com/realms/customers */
  issuerUrl?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  scopes: string;
  linkByEmail: boolean;
  /** Origins (besides FRONTED_URL) the login callback may return to. */
  returnOrigins: string[];
}

export interface SessionConfig {
  cookieName: string;
  cookieDomain?: string;
  cookieSecure: boolean;
  idleTtlSeconds: number;
  absoluteTtlSeconds: number;
}

export interface MachineAuthConfig {
  /** Keycloak realm that issues device tokens — never the customer realm. */
  keycloakIssuerUrl?: string;
  keycloakAudience?: string;
  requiredRole: string;
  apiKeysEnabled: boolean;
}

/** Reader of an external ingest stream (Felix's ingest API → Redis `ingest:readings`). */
export interface IngestBridgeConfig {
  enabled: boolean;
  redisUrl: string;
  streamKey: string;
  payloadField: string;
  startId: string;
  batchSize: number;
  blockMs: number;
  /** `xread` (read-only account, cursor in MongoDB) or `group` (Felix's consumer group). */
  mode: 'xread' | 'group';
  group: string;
  /** Stable consumer name (group mode); default carbonoz-<hostname>. */
  consumer: string;
  /** Group mode: claim entries another consumer left pending this long. */
  claimIdleMs: number;
}

export interface SolarConfig {
  workerEnabled: boolean;
  streamKey: string;
  streamMaxLen: number;
  liveTtlSeconds: number;
  /** Pending entries idle this long are claimed again. */
  reclaimIdleMs: number;
  /** After this many deliveries a message is dead-lettered. */
  maxDeliveries: number;
}

interface JwtConfig {
  secret: string;
}

interface IRedexConfig {
  url: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

interface amdinConfig {
  email: string;
  password: string;
}

interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
}
