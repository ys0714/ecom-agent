import { ChromaClient, Collection } from 'chromadb';
import { config } from '../config.js';
import { rootLogger } from './logger.js';

const logger = rootLogger.child('VectorStore');

export interface VectorDocument {
  id: string;
  text: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
  distance: number;
}

export interface VectorStore {
  initialize(): Promise<void>;
  addDocuments(docs: VectorDocument[]): Promise<void>;
  search(query: string, limit?: number): Promise<VectorSearchResult[]>;
}

export class ChromaVectorStore implements VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;

  constructor(opts: { url: string; collectionName: string }) {
    this.client = new ChromaClient({ path: opts.url });
    this.collectionName = opts.collectionName;
  }

  async initialize(): Promise<void> {
    try {
      // Create or get the collection. 
      // If we don't provide an embedding function, it uses the default one (downloads a model locally).
      // For a lightweight setup, we rely on the default embedding function.
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
      });
      logger.info(`ChromaDB initialized with collection: ${this.collectionName}`);
    } catch (error) {
      logger.error('Failed to initialize ChromaDB', { error: String(error) });
      throw error;
    }
  }

  async addDocuments(docs: VectorDocument[]): Promise<void> {
    if (!this.collection) {
      throw new Error('VectorStore not initialized');
    }

    const ids = docs.map(d => d.id);
    const documents = docs.map(d => d.text);
    const metadatas = docs.map(d => d.metadata ?? {});

    await this.collection.add({
      ids,
      documents,
      metadatas,
    });
  }

  async search(query: string, limit: number = 3): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      throw new Error('VectorStore not initialized');
    }

    const results = await this.collection.query({
      queryTexts: [query],
      nResults: limit,
    });

    const searchResults: VectorSearchResult[] = [];
    
    if (results.ids[0]) {
      const ids = results.ids[0];
      const documents = results.documents[0] as string[];
      const metadatas = results.metadatas[0] as Record<string, string | number | boolean>[];
      const distances = results.distances?.[0] as number[] | undefined;

      for (let i = 0; i < ids.length; i++) {
        searchResults.push({
          id: ids[i],
          text: documents[i],
          metadata: metadatas[i] ?? {},
          distance: distances?.[i] ?? 0,
        });
      }
    }

    return searchResults;
  }
}

export const vectorStore = new ChromaVectorStore({
  url: config.vectorStore.url,
  collectionName: config.vectorStore.collectionName,
});
