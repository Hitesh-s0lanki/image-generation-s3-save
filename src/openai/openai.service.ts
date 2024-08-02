import { Injectable } from '@nestjs/common';
import axios from 'axios';
import Openai, { OpenAI } from 'openai';
import { S3Client, PutObjectCommand, ListObjectsCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as csv from 'csv-parser';
import * as fastcsv from 'fast-csv';
import path from 'path';

interface ImageData {
    image_urls: string[];
    s3_keys: string[];
}

interface NewRowData {
    dish_name: string;
    meal: string[];
    Cuisine: string;
    dietary_preference: string;
    tag_type: string;
    Jain: string;
    Fried: string;
    Baked: string;
    Steamed: string;
    Sugar_free: string;
    Gluten: string;
    Nuts: string;
    Vegan: string;
    Serving_tyoe: string;
    s3_key?: string;
}

@Injectable()
export class OpenaiService {
    private openai: OpenAI;
    private s3Client: S3Client;
    private bucketName = 'eventcrm.io';

    constructor() {
        this.openai = new Openai({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.s3Client = new S3Client({
            region: 'ap-south-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
    }

    async generateImage() {
        let cnt = 0

        const rows = await this.getRows()
        const image_urls: string[] = []
        const s3_keys: string[] = []

        for (let row of rows) {

            const getColumn = await this.getFirstColumn()

            let data: NewRowData = row

            if (getColumn.includes(data.dish_name))
                continue

            if (!row.s3_key) {

                const store_dish = await this.getFileNameFromS3()
                const key = `dish/${row.dish_name.split(" ").join("_") + ".png"}`

                if (!store_dish.includes(key)) {

                    const response = await this.openai.images.generate({
                        model: "dall-e-2",
                        prompt: row.dish_name,
                        n: 1,
                        size: "1024x1024"
                    });

                    const image_url = response.data[0].url;

                    const s3Url = await this.downloadAndUploadImage(image_url, row.dish_name.split(" ").join("_") + ".png");

                    data.s3_key = s3Url
                } else {
                    data.s3_key = key
                }
            }

            cnt += 1

            await this.appendNewRow(data)

            console.log({
                cnt,
            })
        }

        return {
            image_urls,
            s3_keys
        };

    }

    async downloadImage(url: string): Promise<Buffer> {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer',
        });
        return response.data;
    }

    async uploadToS3(buffer: Buffer, filename: string) {
        const key = `dish/${filename}`




        const command = new PutObjectCommand({
            Bucket: 'eventcrm.io',
            Key: key,
            Body: buffer,
            ContentType: 'image/png',
        });

        await this.s3Client.send(command);

        return key
    }

    async downloadAndUploadImage(url: string, filename: string): Promise<string> {
        const imageBuffer = await this.downloadImage(url);
        const s3Url = await this.uploadToS3(imageBuffer, filename);
        return s3Url;
    }

    async getFirstColumn(filePath = "src/utils/soup_data_new.csv"): Promise<string[]> {
        const results: string[] = [];
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data[Object.keys(data)[0]]))
                .on('end', () => resolve(results))
                .on('error', (err) => reject(err));
        });
    }

    async getRows(filePath = 'src/utils/soup_data.csv'): Promise<NewRowData[]> {
        const results: NewRowData[] = [];
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    const row: NewRowData = {
                        dish_name: data['Name of Dish'],
                        meal: data['Meal'].split(',').map((item: string) => item.trim()),
                        Cuisine: data['Cuisine'],
                        tag_type: data['Tag Type'],
                        dietary_preference: data['Type'],
                        Serving_tyoe: data['Serving Type'],
                        Jain: data['Jain'],
                        Fried: data['Fried'],
                        Baked: data['Baked'],
                        Steamed: data['Steamed'],
                        Sugar_free: data['Sugar-Free'],
                        Gluten: data['Gluten'],
                        Nuts: data['Nuts'],
                        Vegan: data['Vegan'],
                        s3_key: data['s3_key'] ? data['s3_key'] : ''
                    };
                    results.push(row);
                })
                .on('end', () => resolve(results))
                .on('error', (err) => reject(err));
        });
    }

    test() {
        return this.getFileNameFromS3()
    }

    async getFileNameFromS3(): Promise<string[]> {
        try {
            const command = new ListObjectsCommand({
                Bucket: this.bucketName,
                Prefix: "dish/"
            });

            const response = await this.s3Client.send(command);

            if (response.Contents) {
                return response.Contents.map((item) => item.Key);
            }

            return [];
        } catch (error) {
            console.error('Error getting file names from S3:', error);
            throw error;
        }
    }


    async addImageColumns(filePath: string, newFilePath: string, imageData: ImageData): Promise<void> {
        const results: any[] = [];
        return new Promise((resolve, reject) => {
            let rowIndex = 0;
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => {
                    data['s3_key'] = imageData.s3_keys[rowIndex];
                    results.push(data);
                    rowIndex++;
                })
                .on('end', () => {
                    const ws = fs.createWriteStream(newFilePath);
                    fastcsv
                        .write(results, { headers: true })
                        .pipe(ws)
                        .on('finish', resolve)
                        .on('error', reject);
                })
                .on('error', (err) => reject(err));
        });
    }

    async appendNewRow(newRowData: NewRowData) {
        await this.appendNewRowFunc("src/utils/soup_data_new.csv", newRowData);
    }

    async appendNewRowFunc(filePath: string, newRowData: NewRowData): Promise<void> {
        const ws = fs.createWriteStream(filePath, { flags: 'a' });
        fastcsv
            .write([newRowData], { headers: false, includeEndRowDelimiter: true })
            .pipe(ws)
            .on('finish', () => console.log('Row appended successfully'))
            .on('error', (err) => console.error('Error appending row:', err));
    }
}
