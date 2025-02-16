import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as csv from 'csv-parser';

@Injectable()
export class AwsService {
    private s3: AWS.S3;
    private bucketName = process.env.AWS_S3_BUCKET_NAME;
    private prefix = 'landscape/dessert/'

    constructor() {
        this.s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
        });
    }

    async test() {
        const images = await this.getFileNameFromS3()

        for (let image of images) {
            try {
                const key = image
                const newName = `dish/${image.split(this.prefix)[1]}`

                await this.changeFiles(key, newName)

                console.log(`Done for ${image.split(this.prefix)[1]}`)
            } catch (error) {
                console.log({
                    image, error
                })
            }
        }

        return 'Done with the replace of Data'
    }

    async getFileNameFromS3(): Promise<string[]> {
        try {
            const params = {
                Bucket: this.bucketName,
                Prefix: this.prefix,
            };

            const response = await this.s3.listObjectsV2(params).promise();

            if (response.Contents) {
                return response.Contents.map((item) => item.Key as string);
            }

            return [];
        } catch (error) {
            console.error('Error getting file names from S3:', error);
            throw error;
        }
    }

    async changeFiles(key: string, newName: string) {
        try {
            const file = await this.getFile(key);

            // Ensure file.Body is a Buffer
            if (!Buffer.isBuffer(file.Body)) {
                throw new Error('File body is not a buffer');
            }

            await this.uploadFile(newName, file.Body as Buffer);

        } catch (error) {
            console.log("Something Went Wrong!", error);
        }
    }

    async uploadFile(key: string, file: Buffer): Promise<AWS.S3.ManagedUpload.SendData> {
        const params = {
            Bucket: this.bucketName,
            Key: key,
            Body: file,
            ContentType: 'image/png', // Adjust content type as needed
        };

        return this.s3.upload(params).promise();
    }

    async getFile(key: string): Promise<AWS.S3.GetObjectOutput> {
        const params = {
            Bucket: this.bucketName,
            Key: key,
        };

        return this.s3.getObject(params).promise();
    }

    async getData() {
        const data = await this.getRows()
    }

    getPresignedUrl(key: string, expires: number = 3600): string {
        const params = {
            Bucket: this.bucketName,
            Key: key,
            Expires: expires, // Time in seconds
        };

        return this.s3.getSignedUrl('getObject', params);
    }

    async getRows(filePath = 'src/utils/soup_data.csv'): Promise<string[]> {
        const results: string[] = [];
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    results.push(data['Name of Dish']);
                })
                .on('end', () => resolve(results))
                .on('error', (err) => reject(err));
        });
    }
}
