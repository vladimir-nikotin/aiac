import { Injectable } from '@nestjs/common';

import { ClaudeService, ClaudeStopReason, Message } from '../claude';
import { HistoryService } from './history.service';
import { COMPRESSION_SYSTEM_CODE, COMPRESSION_USER_CODE } from './prompts';
import { SummaryService } from './summary.service';

export enum ContextStrategy {
  Full = 'full',
  Summarize = 'summ',
}
export type AgentServiceRequestParams = {
  contextStrategy?: ContextStrategy;
  conversations?: number;
  model?: string;
  stopSequences: string[];
  temperature?: number;
};
type AgentServiceRequest = AgentServiceRequestParams & {
  model: string;
  question: string;
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
    private readonly summary: SummaryService,
  ) {}

  async ask({
    contextStrategy = ContextStrategy.Full,
    conversations = 20,
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

    const messages = await this.getMessages(
      contextStrategy,
      conversations,
      model,
      question,
    );

    const {
      content,
      stop_reason: reason,
      stop_sequence: sequence,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      messages,
      model,
      stopSequences,
      temperature,
    });

    // TODO do not add if reason === 'max_tokens'

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

  private createUserMessage(prompts: string[]): Message {
    const nonEmptyPrompts = prompts
      .map((value) => value.trim())
      .filter((value) => !!value);
    if (nonEmptyPrompts.length < 1) {
      throw new Error('Internal: cannot create empty user message');
    }
    return {
      content: nonEmptyPrompts.map((text) => ({
        text,
        type: 'text',
      })),
      role: 'user',
    };
  }

  private async getMessages(
    contextStrategy: ContextStrategy,
    conversations: number,
    // TODO контролируя проверку ошибок и max tokens, я бы мог сам выбирать модель
    model: string,
    question: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const history = this.history.get().map(({ usage, ...message }) => message);
    let summarize = true;

    if (contextStrategy !== ContextStrategy.Summarize) {
      // Не суммаризируем, если стратегия не Summarize
      summarize = false;
    } else if (history.length < conversations * 2) {
      // Не суммаризируем, если не достигнут лимит
      summarize = false;
    }

    // в противном случае сводка уже есть в истории, осталось добавить новое сообщение
    if (!summarize) {
      history.push(this.createUserMessage([question]));
      return history;
    }

    const {
      content,
      // stop_reason,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      messages: [...history, this.createUserMessage([COMPRESSION_USER_CODE])],
      model,
      stopSequences: [],
      system: COMPRESSION_SYSTEM_CODE,
    });

    // TODO stop_reason == 'max_tokens'

    await this.history.flush(input, output);
    await this.summary.save(content);

    return [
      this.createUserMessage([
        ...content.map(({ text }) => text).filter((text) => !!text),
        question,
      ]),
    ];
  }
}
