import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { connectDatabase } from "@database/connection";
import { AppModule } from "./app.module";
import { appConfig, databaseConfig, validate } from "./config";

async function bootstrap(): Promise<void> {
    validate(process.env);

    const app = appConfig();
    const database = databaseConfig();

    await connectDatabase(database.uri);

    const nest = await NestFactory.create(AppModule, { bodyParser: true });

    nest.use(cookieParser());

    nest.enableCors({
        origin: app.dashboardUrl,
        credentials: true,
    });

    nest.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    await nest.listen(app.port);
    Logger.log(`Dashboard API listening on ${app.publicApiUrl} (port ${app.port})`, "bootstrap");
}

void bootstrap();
