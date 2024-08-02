import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { OpenaiModule } from './openai/openai.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true
  }), OpenaiModule, UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
