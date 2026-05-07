import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
}

export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      ...(config.endpoint && { endpoint: config.endpoint }),
    });
    this.bucket = config.bucket;
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    projectId: string,
    contentType: string = "application/octet-stream"
  ): Promise<string> {
    const key = `projects/${projectId}/files/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      Metadata: {
        "project-id": projectId,
        "upload-date": new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);
      return key;
    } catch (error) {
      console.error("Error uploading file to S3:", error);
      throw new Error("Failed to upload file to S3");
    }
  }

  async uploadAnnotationSet(
    fileBuffer: Buffer,
    fileName: string,
    projectId: string,
    format: string,
    tenantId?: string
  ): Promise<string> {
    const key = tenantId
      ? `tenants/${tenantId}/projects/${projectId}/annotations/${Date.now()}-${fileName}`
      : `projects/${projectId}/annotations/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: "application/json",
      Metadata: {
        "project-id": projectId,
        "format": format,
        "upload-date": new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);
      return key;
    } catch (error) {
      console.error("Error uploading annotation set to S3:", error);
      throw new Error("Failed to upload annotation set to S3");
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        const stream = response.Body as any;
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
      });
    } catch (error) {
      console.error("Error downloading file from S3:", error);
      throw new Error("Failed to download file from S3");
    }
  }

  async getSignedDownloadUrl(key: string, expirationSeconds: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expirationSeconds,
      });
    } catch (error) {
      console.error("Error generating signed URL:", error);
      throw new Error("Failed to generate signed download URL");
    }
  }

  async getSignedUploadUrl(
    fileName: string,
    projectId: string,
    expirationSeconds: number = 3600
  ): Promise<string> {
    const key = `projects/${projectId}/files/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expirationSeconds,
      });
    } catch (error) {
      console.error("Error generating signed upload URL:", error);
      throw new Error("Failed to generate signed upload URL");
    }
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
    } catch (error) {
      console.error("Error deleting file from S3:", error);
      throw new Error("Failed to delete file from S3");
    }
  }

  async listProjectFiles(projectId: string, prefix: string = ""): Promise<string[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: `projects/${projectId}/${prefix}`,
    });

    try {
      const response = await this.s3Client.send(command);
      return (response.Contents || []).map((obj) => obj.Key || "");
    } catch (error) {
      console.error("Error listing files from S3:", error);
      throw new Error("Failed to list files from S3");
    }
  }

  async batchUploadFiles(
    files: Array<{ buffer: Buffer; name: string }>,
    projectId: string
  ): Promise<string[]> {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file.buffer, file.name, projectId)
    );

    try {
      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error("Error batch uploading files:", error);
      throw new Error("Failed to batch upload files");
    }
  }

  async deleteProjectFiles(projectId: string): Promise<void> {
    const files = await this.listProjectFiles(projectId);

    if (files.length === 0) return;

    const deletePromises = files.map((key) => this.deleteFile(key));

    try {
      await Promise.all(deletePromises);
    } catch (error) {
      console.error("Error batch deleting files:", error);
      throw new Error("Failed to delete project files");
    }
  }
}
