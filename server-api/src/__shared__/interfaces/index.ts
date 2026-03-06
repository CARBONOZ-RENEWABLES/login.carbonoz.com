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
