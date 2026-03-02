export interface IAppConfig {
  port?: number;
  databaseUrl: string;
  env?: any;
  jwt?: JwtConfig;
  swaggerEnabled?: boolean;
  redex?: IRedexConfig;
  frontedUrl: string;
  admin: amdinConfig;
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
