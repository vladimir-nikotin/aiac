import { Module } from '@nestjs/common';

import { ClaudeModule } from '../claude';

import { AgentService } from './agent.service';
import { HistoryService } from './history.service';
import { SummaryService } from './summary.service';

@Module({
  imports: [ClaudeModule],
  exports: [AgentService],
  providers: [AgentService, HistoryService, SummaryService],
})
export class AgentModule {}
