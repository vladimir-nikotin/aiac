import { Injectable } from '@nestjs/common';
import readline from 'readline';

import { ClaudeService, ClaudeServiceResponse } from './claude/claude.service';

const getAsk = (rl: readline.Interface) => (prompt: string) =>
  new Promise<string>((resolve) => rl.question(prompt, resolve));

const models: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  opus6: 'claude-opus-4-6',
  opus7: 'claude-opus-4-7',
  opus8: 'claude-opus-4-8',
};

@Injectable()
export class CliService {
  constructor(private readonly claude: ClaudeService) {}

  async run() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = getAsk(rl);
    let lines: string[] = [];
    let model: string | undefined;
    let stopSequences: string[] = [];
    let temperature: number | undefined;

    while (true) {
      const userInput = await ask('> ').then((input: string) => input.trim());

      if (userInput.startsWith('/model')) {
        const modelValue = models[userInput.slice(7).trim()];
        if (modelValue) {
          model = modelValue;
        }
      }
      if (userInput.startsWith('/stop')) {
        stopSequences.push(userInput.slice(6).trim());
      }
      if (userInput.startsWith('/temp')) {
        temperature = Number.parseFloat(userInput.slice(6));
      }

      if (userInput !== '') {
        lines.push(userInput);
        continue;
      }
      if (lines.length === 0) {
        continue;
      }

      rl.pause();

      const message = lines.join('\n');

      let sessionId = this.claude.startSession();
      let answer = await this.claude.fetchApi({
        message,
        model: model ?? models.haiku,
        sessionId,
        stopSequences,
        temperature,
      });
      this.printAnswer(answer);
      this.claude.closeSession(sessionId);

      sessionId = this.claude.startSession();
      answer = await this.claude.fetchApi({
        message,
        model: model ?? models.sonnet,
        sessionId,
        stopSequences,
        temperature,
      });
      this.printAnswer(answer);
      this.claude.closeSession(sessionId);

      sessionId = this.claude.startSession();
      answer = await this.claude.fetchApi({
        message,
        model: model ?? models.opus7,
        sessionId,
        stopSequences,
        temperature,
      });
      this.printAnswer(answer);
      this.claude.closeSession(sessionId);

      rl.resume();

      lines = [];
      model = undefined;
      stopSequences = [];
      temperature = undefined;
    }
  }

  printAnswer({
    answer,
    input,
    output,
    reason,
    sequence,
  }: ClaudeServiceResponse) {
    process.stdout.write(`< in ${input} out ${output}`);
    if (reason === 'max_tokens') {
      process.stdout.write(` ! TOKENS`);
    }
    if (sequence !== null) {
      process.stdout.write(` ! ${sequence}`);
    }
    process.stdout.write('\n');

    process.stdout.write(answer);
    process.stdout.write('\n\n\n\n\n\n\n\n\n');
  }
}
