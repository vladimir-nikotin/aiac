import { Injectable } from '@nestjs/common';
import readline from 'readline';

import { ClaudeService } from './claude.service';

@Injectable()
export class CliService {
  constructor(private readonly claude: ClaudeService) {}

  async run() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const ask = (prompt: string) =>
      new Promise<string>((resolve) => rl.question(prompt, resolve));
    const sessionId = this.claude.startSession();

    let lines: string[] = [];
    const stopSequences: string[] = [];

    while (true) {
      const userInput = await ask('> ').then((input: string) => input.trim());

      if (userInput.startsWith('/stop')) {
        stopSequences.push(userInput.slice(6));
      }
      if (userInput !== '') {
        lines.push(userInput);
        continue;
      }
      if (lines.length === 0) {
        continue;
      }

      const { answer, input, output, reason, sequence } =
        await this.claude.fetchApi({
          message: lines.join('\n'),
          sessionId,
          stopSequences,
        });

      rl.pause();

      process.stdout.write(`< in ${input} out ${output}`);
      if (reason === 'max_tokens') {
        process.stdout.write(` ! TOKENS`);
      }
      if (sequence !== null) {
        process.stdout.write(` ! ${sequence}`);
      }
      process.stdout.write('\n');

      process.stdout.write(answer);
      process.stdout.write('\n\n');

      rl.resume();

      lines = [];
    }
  }
}
