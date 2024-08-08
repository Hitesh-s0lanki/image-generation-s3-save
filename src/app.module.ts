import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { OpenaiModule } from './openai/openai.module';
import { UploadModule } from './upload/upload.module';
import { AwsModule } from './aws/aws.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true
  }), OpenaiModule, UploadModule, AwsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
