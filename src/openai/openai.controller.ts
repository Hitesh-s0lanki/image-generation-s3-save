import { Controller, Get } from '@nestjs/common';
import { OpenaiService } from './openai.service';

@Controller('openai')
export class OpenaiController {
  constructor(private readonly openaiService: OpenaiService) { }

  @Get()
  generateImage() {
    return this.openaiService.generateImage();
  }

  @Get('csv')
  getFirstColumn() {
    return this.openaiService.getFirstColumn()
  }
}
