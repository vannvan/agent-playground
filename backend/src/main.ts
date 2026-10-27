import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)
    ?? (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']);
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
