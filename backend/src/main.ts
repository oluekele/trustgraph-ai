import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { appConfig, authConfig, trustGraphConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const logger = new Logger('Bootstrap');
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  const auth = app.get<ConfigType<typeof authConfig>>(authConfig.KEY);
  const trustGraph = app.get<ConfigType<typeof trustGraphConfig>>(trustGraphConfig.KEY);

  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Swagger UI needs inline scripts/styles; the API itself only returns JSON.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.frontendOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      // Free-form `arguments`, `context.attributes` and `script` objects are validated with @IsObject()
      // and passed through untouched; only declared DTO properties are whitelisted.
      forbidUnknownValues: true,
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('TrustGraph AI - Governance Gateway')
    .setDescription(
      'Operator-facing API gateway. Authentication and role-based access control for human operators; ' +
        'all identity, delegation, policy, risk and approval decisions are made by the authoritative ' +
        'TrustGraph governance engine (Python) and relayed unchanged.',
    )
    .setVersion('1.0.0')
    .addCookieAuth(auth.cookieName)
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig), {
    swaggerOptions: { withCredentials: true, persistAuthorization: true },
  });

  if (auth.usingDevSecret) {
    logger.warn('JWT_SECRET is not set; using an insecure development secret. Set JWT_SECRET for any shared deployment.');
  }
  if (!trustGraph.serviceToken) {
    logger.warn('TRUSTGRAPH_SERVICE_TOKEN is empty; calls to the governance engine are not service-authenticated.');
  }

  await app.listen(config.port);
  logger.log(`Gateway listening on :${config.port} (API /api, docs /docs) -> governance engine ${trustGraph.baseUrl}`);
}

void bootstrap();
