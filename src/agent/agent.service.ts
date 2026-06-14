import { Injectable } from '@nestjs/common';

import { ClaudeService, ClaudeStopReason, Message } from '../claude';
import { HistoryService } from './history.service';

type AgentServiceRequest = {
  model?: string;
  question: string;
  stopSequences: string[];
  temperature?: number;
};
export type TokenUsage = {
  input: number;
  output: number;
};
export type AgentServiceResponse = {
  answer: string;
  reason: ClaudeStopReason;
  sequence: string | null;
  total: TokenUsage;
  usage: TokenUsage;
};

@Injectable()
export class AgentService {
  constructor(
    private readonly claude: ClaudeService,
    private readonly history: HistoryService,
  ) {}

  async ask({
    model,
    question,
    stopSequences,
    temperature,
  }: AgentServiceRequest): Promise<AgentServiceResponse> {
    const message: Message = {
      content: [
        {
          text: question,
          type: 'text',
        },
      ],
      role: 'user',
    };
    const history = this.history.get();

    const {
      content,
      stop_reason: reason,
      stop_sequence: sequence,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      messages: [...history.map(({ usage, ...message }) => message), message],
      model,
      stopSequences,
      temperature,
    });

    await this.history.add(
      {
        ...message,
        usage: input,
      },
      {
        content,
        role: 'assistant',
        usage: output,
      },
    );

    let answer = '';

    for (const { type, ...others } of content) {
      if (answer.length > 0) {
        answer += '\n\n';
      }
      if (type === 'text') {
        answer += others.text;
      } else {
        answer += `[${type}]`;
      }
    }

    return {
      answer,
      reason,
      sequence,
      total: this.history.total,
      usage: { input, output },
    };
  }
}
