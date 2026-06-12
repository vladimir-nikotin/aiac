import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';

// No web, cli only
// import { AppController } from './app.controller';
// import { AppService } from './app.service';

import claude from './claude.config';
import { ClaudeService } from './claude/claude.service';
import { CliService } from './cli.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '..', '.env'),
      load: [claude],
    }),
  ],
  controllers: [
    // AppController
  ],
  providers: [/* AppService, */ ClaudeService, CliService],
})
export class AppModule {}
