import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

// No web, cli only
// import { AppController } from './app.controller';
// import { AppService } from './app.service';

import { AgentModule, config as agentConfig } from './agent';
import { config as claudeConfig } from './claude';
import { CliService } from './cli.service';
import { DraftService } from './draft.service';

@Module({
  imports: [
    AgentModule,
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '..', '.env'),
      isGlobal: true,
      load: [agentConfig, claudeConfig],
    }),
  ],
  controllers: [
    // AppController
  ],
  providers: [/* AppService, */ CliService, DraftService],
})
export class AppModule {}
