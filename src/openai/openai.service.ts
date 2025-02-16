import { Injectable } from '@nestjs/common';
import axios from 'axios';
import Openai, { OpenAI } from 'openai';
import { S3Client, PutObjectCommand, ListObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as csv from 'csv-parser';
import * as fastcsv from 'fast-csv';

interface ImageData {
    image_urls: string[];
    s3_keys: string[];
}

interface NewRowData {
    course: string;
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
    description?: string;
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
        const rows = await this.getRows()

        for (let row of rows) {
            try {
                let data: NewRowData = row
                const key = `dish/${row.dish_name.split(" ").join("_") + ".png"}`
                const keyExists = await this.getFileNameFromS3(key);

                console.log({
                    dish_name: row.dish_name,
                    description: row.description
                })

                if (keyExists) {
                    console.log(`Already there ${key}`)

                    data.s3_key = key
                } else {
                    console.log("Generating...")
                    const response = await this.openai.images.generate({
                        model: "dall-e-3",
                        prompt: `
                        Dish name = ${row.dish_name} ${row.Cuisine}
                        
                        Description : ${row.description}
                        `,
                        n: 1,
                        size: "1792x1024"
                    });

                    const image_url = response.data[0].url;

                    const s3Url = await this.downloadAndUploadImage(image_url, row.dish_name.split(" ").join("_") + ".png");

                    data.s3_key = s3Url
                }
                await this.appendNewRow(data)
            } catch (error) {
                console.log({ error, dish: row.dish_name })
            }
        }

        return "Done with the data!";
    }

    async getFileNameFromS3(key: string): Promise<boolean> {
        try {
            // First, check if the key exists by trying to get the head of the object
            const headCommand = new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            try {
                await this.s3Client.send(headCommand);
                console.log(`Key '${key}' exists in the S3 bucket.`);
                return true; // If no error, the key exists
            } catch (error: any) {
                if (error.name === 'NotFound') {
                    console.log(`Key '${key}' does not exist.`);
                    return false; // Key doesn't exist
                } else {
                    throw error; // Throw other errors
                }
            }
        } catch (error) {
            console.error('Error checking file existence in S3:', error);
            throw error;
        }
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
                .on('data', (data) => results.push(data[Object.keys(data)[1]]))
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
                        course: data["Course"],
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
                        description: data['Description'],
                        s3_key: data['s3_key'] ? data['s3_key'] : ''
                    };
                    results.push(row);
                })
                .on('end', () => resolve(results))
                .on('error', (err) => reject(err));
        });
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
