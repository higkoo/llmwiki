import json
import logging

import aioboto3

from config import settings

logger = logging.getLogger(__name__)


class S3Service:
    def __init__(self):
        self._session = aioboto3.Session(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        self._bucket = settings.S3_BUCKET

    async def upload_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream"):
        async with self._session.client("s3") as s3:
            await s3.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    async def upload_file(self, key: str, file_path: str, content_type: str = "application/octet-stream"):
        async with self._session.client("s3") as s3:
            with open(file_path, "rb") as f:
                await s3.put_object(Bucket=self._bucket, Key=key, Body=f.read(), ContentType=content_type)

    async def generate_presigned_get(self, key: str, expires_in: int = 3600) -> str:
        async with self._session.client("s3") as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            return url

    async def download_bytes(self, key: str) -> bytes:
        async with self._session.client("s3") as s3:
            resp = await s3.get_object(Bucket=self._bucket, Key=key)
            return await resp["Body"].read()

    async def download_to_file(self, key: str, file_path: str):
        data = await self.download_bytes(key)
        with open(file_path, "wb") as f:
            f.write(data)

    async def download_json(self, key: str) -> dict:
        body = await self.download_bytes(key)
        return json.loads(body)
