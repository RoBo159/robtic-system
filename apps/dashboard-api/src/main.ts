import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger as NestLogger, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { connectDatabase } from "@database/connection";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

async function bootstrap(): Promise<void> {
    // Read before Nest builds anything, so a missing variable fails here with its own name rather
    // than inside a provider factory behind a DI stack trace.
    const env = loadEnv();

    await connectDatabase(env.mongoUri);

    const app = await NestFactory.create(AppModule, { bodyParser: true });

    app.use(cookieParser());

    app.enableCors({
        // Exactly one origin, and credentials on: the session is a cookie, so a wildcard origin is
        // both rejected by browsers and the wrong thing to want.
        origin: env.dashboardUrl,
        credentials: true,
    });

    app.useGlobalPipes(new ValidationPipe({
        // `whitelist` strips properties no DTO declares and `forbidNonWhitelisted` rejects them
        // outright — between them, a request cannot smuggle a field a controller forgot to ignore.
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));

    await app.listen(env.port);
    NestLogger.log(`Dashboard API listening on ${env.publicApiUrl} (port ${env.port})`, "bootstrap");
}

void bootstrap();
