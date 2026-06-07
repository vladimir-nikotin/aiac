import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ProxyAgent, fetch } from 'undici';

type Role = 'assistant' | 'user';
type Message = {
  content: string;
  role: Role;
};

type ClaudeResponseTextContent = {
  type: 'text';
  text: string;
};
type ClaudeResponseToolContent = {
  type: 'tool_use';
  text: never;
  id: string;
  name: string;
  input: Record<string, any>;
};
type ClaudeResponseContent =
  | ClaudeResponseTextContent
  | ClaudeResponseToolContent;

type ClaudeStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use';
type ClaudeTokenUsage = {
  input_tokens: number;
  output_tokens: number;
};

type ClaudeResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ClaudeResponseContent[];
  stop_reason: ClaudeStopReason;
  stop_sequence: string | null;
  usage: ClaudeTokenUsage;
};

type UUID = string;
type ClaudeServiceRequest = {
  message: string;
  sessionId: UUID;
  stopSequences: string[];
};
type ClaudeServiceResponse = {
  answer: string;
  input: number;
  output: number;
  reason: ClaudeStopReason;
  sequence: string | null;
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';

@Injectable()
export class ClaudeService {
  private readonly history = new Map<UUID, Message[]>();

  constructor(private readonly config: ConfigService) {}

  async fetchApi({
    message,
    sessionId,
    stopSequences,
  }: ClaudeServiceRequest): Promise<ClaudeServiceResponse> {
    const messages = this.history.get(sessionId);

    if (messages === undefined) {
      throw new Error(
        `Session ID ${sessionId} doesn't exist, call startSession first`,
      );
    }

    const headers = {
      'anthropic-version': this.config.getOrThrow<string>('claude.api.version'),
      'content-type': 'application/json',
      'x-api-key': this.config.getOrThrow<string>('claude.api.key'),
    };
    const dispatcher = new ProxyAgent({
      uri: this.config.getOrThrow<string>('claude.proxy.url'),
    });

    const question: Message = {
      content: message,
      role: 'user',
    };

    const response = await fetch(
      this.config.getOrThrow<string>('claude.api.url'),
      {
        body: JSON.stringify({
          max_tokens: this.config.getOrThrow<number>('claude.maxTokens'),
          messages: [...messages, question],
          model: DEFAULT_MODEL,
        }),
        dispatcher,
        headers,
        method: 'POST',
      },
    );

    const { ok, status, statusText } = response;

    if (!ok) {
      throw new Error(`Error ${status} ${statusText}`);
    }
    if (status !== 200) {
      throw new Error(`Something went wrong ${status} ${statusText}`);
    }

    const {
      content,
      stop_reason: reason,
      stop_sequence: sequence,
      usage: { input_tokens: input, output_tokens: output },
    } = (await response.json()) as ClaudeResponse;
    let answer = '';

    for (const { type, ...others } of content) {
      if (type === 'text') {
        if (answer.length > 0) {
          answer += '\n\n';
        }
        answer += others.text;
      }
    }

    messages.push(question);
    messages.push({
      content: answer,
      role: 'assistant',
    });

    return {
      answer,
      input,
      output,
      reason,
      sequence,
    };
  }

  startSession(): UUID {
    const sessionId = randomUUID();
    this.history.set(sessionId, []);
    return sessionId;
  }
  closeSession(sessionId: UUID) {
    this.history.delete(sessionId);
  }
}
