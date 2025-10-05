import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Interface untuk result yang lebih comprehensive
export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  format?: string;
  resource_type?: string;
}

export interface CloudinaryDeleteResult {
  result: string;
}

export const uploadToCloudinary = (file: Express.Multer.File, folder?: string): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    // FIX: Validasi file lebih comprehensive
    if (!file) {
      reject(new Error('File is required'));
      return;
    }

    if (!file.buffer || file.buffer.length === 0) {
      reject(new Error('File buffer is empty'));
      return;
    }

    // FIX: Validasi file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      reject(new Error('File size too large. Maximum size is 10MB'));
      return;
    }

    // FIX: Validasi file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      reject(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed'));
      return;
    }

    const uploadFolder = folder || 'event-management';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: uploadFolder,
        // FIX: Tambah optimization settings
        quality: 'auto',
        fetch_format: 'auto',
        // FIX: Tambah transformation untuk konsistensi
        transformation: [
          { width: 1200, height: 800, crop: 'limit' }, // Max dimensions
          { quality: 'auto:good' } // Optimize quality
        ]
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Upload failed: ${error.message}`));
        } else if (result && result.secure_url) {
          // FIX: Return comprehensive result
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            resource_type: result.resource_type
          });
        } else {
          reject(new Error('Upload failed: No result returned'));
        }
      }
    );

    // FIX: Error handling untuk stream
    uploadStream.on('error', (error: Error) => {
      console.error('Cloudinary stream error:', error);
      reject(new Error(`Upload stream failed: ${error.message}`));
    });

    // Convert buffer to stream dengan error handling
    try {
      const stream = Readable.from(file.buffer);
      stream.pipe(uploadStream);
      
      // Handle stream errors
      stream.on('error', (error: Error) => {
        console.error('Buffer stream error:', error);
        reject(new Error(`File stream error: ${error.message}`));
      });
    } catch (streamError: unknown) {
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown stream error';
      reject(new Error(`Failed to create file stream: ${errorMessage}`));
    }
  });
};

// FIX: Specialized upload functions untuk different use cases
export const uploadEventImage = (file: Express.Multer.File): Promise<CloudinaryUploadResult> => {
  return uploadToCloudinary(file, 'event-management/events');
};

export const uploadPaymentProof = (file: Express.Multer.File): Promise<CloudinaryUploadResult> => {
  return uploadToCloudinary(file, 'event-management/payments');
};

export const uploadUserAvatar = (file: Express.Multer.File): Promise<CloudinaryUploadResult> => {
  return uploadToCloudinary(file, 'event-management/avatars');
};

// FIX: Delete function yang lebih robust
export const deleteFromCloudinary = async (publicId: string): Promise<CloudinaryDeleteResult> => {
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }

    // FIX: Validasi public ID format
    if (typeof publicId !== 'string' || publicId.trim().length === 0) {
      throw new Error('Invalid public ID format');
    }

    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Delete failed: ${result.result}`);
    }

    console.log(`✅ Successfully deleted Cloudinary resource: ${publicId}`);
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error deleting from Cloudinary:', error);
    throw new Error(`Failed to delete file: ${errorMessage}`);
  }
};

// FIX: Extract public ID yang lebih accurate
export const extractPublicId = (url: string): string | null => {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }

    // Cloudinary URL pattern: https://res.cloudinary.com/<cloud_name>/<resource_type>/<type>/<version>/<public_id>.<format>
    const cloudinaryRegex = /cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload\/(?:v\d+\/)?([^/.]+)(?:\.\w+)?$/;
    const match = url.match(cloudinaryRegex);
    
    if (match && match[1]) {
      return match[1];
    }

    // Fallback: extract dari path (untuk URL non-Cloudinary atau custom domains)
    const urlParts = url.split('/');
    const filenameWithExtension = urlParts[urlParts.length - 1];
    
    if (filenameWithExtension && filenameWithExtension.includes('.')) {
      return filenameWithExtension.split('.')[0];
    }

    return filenameWithExtension || null;
  } catch (error: unknown) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

// FIX: Delete by URL utility
export const deleteFromCloudinaryByUrl = async (url: string): Promise<CloudinaryDeleteResult> => {
  try {
    const publicId = extractPublicId(url);
    if (!publicId) {
      throw new Error('Could not extract public ID from URL');
    }
    return await deleteFromCloudinary(publicId);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to delete file by URL: ${errorMessage}`);
  }
};

// FIX: Bulk delete function
export const bulkDeleteFromCloudinary = async (publicIds: string[]): Promise<{ success: string[], failures: string[] }> => {
  const success: string[] = [];
  const failures: string[] = [];

  for (const publicId of publicIds) {
    try {
      await deleteFromCloudinary(publicId);
      success.push(publicId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to delete ${publicId}:`, errorMessage);
      failures.push(publicId);
    }
  }

  console.log(`✅ Bulk delete completed: ${success.length} successful, ${failures.length} failed`);
  return { success, failures };
};

// FIX: Bulk delete by URLs
export const bulkDeleteFromCloudinaryByUrls = async (urls: string[]): Promise<{ success: string[], failures: string[] }> => {
  const publicIds: string[] = [];
  
  // Extract public IDs from URLs
  for (const url of urls) {
    const publicId = extractPublicId(url);
    if (publicId) {
      publicIds.push(publicId);
    }
  }

  return await bulkDeleteFromCloudinary(publicIds);
};

// FIX: Function untuk cek jika resource exists
export const checkResourceExists = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return !!result;
  } catch (error: any) {
    if (error.http_code === 404) {
      return false;
    }
    console.error('Error checking Cloudinary resource:', error);
    throw error;
  }
};

// FIX: Utility function untuk mendapatkan optimized URL
export const getOptimizedImageUrl = (publicId: string, width?: number, height?: number): string => {
  if (!publicId) {
    throw new Error('Public ID is required');
  }

  const transformations = [];
  
  if (width && height) {
    transformations.push(`c_fill,w_${width},h_${height}`);
  } else if (width) {
    transformations.push(`w_${width}`);
  } else if (height) {
    transformations.push(`h_${height}`);
  }
  
  transformations.push('q_auto', 'f_auto');
  
  const transformationString = transformations.join(',');
  
  return cloudinary.url(publicId, {
    transformation: [{ [transformationString]: true }],
    secure: true
  });
};

// FIX: Get image info from public ID
export const getImageInfo = async (publicId: string): Promise<any> => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return result;
  } catch (error: any) {
    if (error.http_code === 404) {
      throw new Error('Image not found');
    }
    console.error('Error getting image info:', error);
    throw error;
  }
};

// FIX: Upload with custom transformations
export const uploadWithTransformations = (
  file: Express.Multer.File, 
  folder?: string, 
  transformations: any[] = []
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('File is required'));
      return;
    }

    if (!file.buffer || file.buffer.length === 0) {
      reject(new Error('File buffer is empty'));
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      reject(new Error('File size too large. Maximum size is 10MB'));
      return;
    }

    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      reject(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed'));
      return;
    }

    const uploadFolder = folder || 'event-management';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: uploadFolder,
        transformation: [
          { width: 1200, height: 800, crop: 'limit' },
          { quality: 'auto:good' },
          ...transformations
        ]
      },
      (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Upload failed: ${error.message}`));
        } else if (result && result.secure_url) {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            resource_type: result.resource_type
          });
        } else {
          reject(new Error('Upload failed: No result returned'));
        }
      }
    );

    uploadStream.on('error', (error: Error) => {
      console.error('Cloudinary stream error:', error);
      reject(new Error(`Upload stream failed: ${error.message}`));
    });

    try {
      const stream = Readable.from(file.buffer);
      stream.pipe(uploadStream);
      
      stream.on('error', (error: Error) => {
        console.error('Buffer stream error:', error);
        reject(new Error(`File stream error: ${error.message}`));
      });
    } catch (streamError: unknown) {
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown stream error';
      reject(new Error(`Failed to create file stream: ${errorMessage}`));
    }
  });
};

// FIX: Validate Cloudinary configuration
export const validateCloudinaryConfig = (): { isValid: boolean; missing: string[] } => {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter(key => !process.env[key] || process.env[key]?.trim() === '');
  
  if (missing.length > 0) {
    console.error('❌ Missing Cloudinary configuration:', missing.join(', '));
    return { isValid: false, missing };
  }
  
  console.log('✅ Cloudinary configuration validated');
  return { isValid: true, missing: [] };
};

// FIX: Test Cloudinary connection
export const testCloudinaryConnection = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // Simple test by trying to list resources (limited to 1)
    const result = await cloudinary.api.resources({
      max_results: 1,
      type: 'upload'
    });
    
    return {
      success: true,
      message: 'Cloudinary connection successful'
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Cloudinary connection failed: ${errorMessage}`
    };
  }
};

// FIX: Initialize dan validate config saat module load
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
  const configCheck = validateCloudinaryConfig();
  
  if (!configCheck.isValid) {
    console.warn('⚠️ Cloudinary configuration is incomplete. File uploads will fail.');
    
    // Test connection if config seems valid
    if (configCheck.missing.length === 0) {
      testCloudinaryConnection().then(result => {
        if (result.success) {
          console.log('✅ Cloudinary connection test passed');
        } else {
          console.warn('⚠️ Cloudinary connection test failed:', result.message);
        }
      });
    }
  } else {
    // Test connection if config is valid
    testCloudinaryConnection().then(result => {
      if (result.success) {
        console.log('✅ Cloudinary connection test passed');
      } else {
        console.warn('⚠️ Cloudinary connection test failed:', result.message);
      }
    });
  }
}

// FIX: Export utility functions
export const cloudinaryUtils = {
  uploadToCloudinary,
  uploadEventImage,
  uploadPaymentProof,
  uploadUserAvatar,
  deleteFromCloudinary,
  deleteFromCloudinaryByUrl,
  bulkDeleteFromCloudinary,
  bulkDeleteFromCloudinaryByUrls,
  extractPublicId,
  checkResourceExists,
  getOptimizedImageUrl,
  getImageInfo,
  uploadWithTransformations,
  validateCloudinaryConfig,
  testCloudinaryConnection
};

export default cloudinary;