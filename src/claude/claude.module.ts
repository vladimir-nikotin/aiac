import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';

@Module({
  exports: [ClaudeService],
  providers: [ClaudeService],
})
export class ClaudeModule {}
