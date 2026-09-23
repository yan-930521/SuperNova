import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings';

/**
 * Mock 向量嵌入模型配置
 */
export interface MockEmbeddingsParams extends EmbeddingsParams {
    /** 向量維度大小，預設 1536 */
    dimension?: number;
}

/**
 * 用於單元測試與離線驗證的 Mock Embeddings
 * 能以確定性演算法產生模擬浮點數向量，不依賴遠端 API
 */
export class MockEmbeddings extends Embeddings {
    private readonly dimension: number;
    public queriedTexts: string[] = [];

    constructor(params?: MockEmbeddingsParams) {
        super(params ?? {});
        this.dimension = params?.dimension ?? 1536;
    }

    /**
     * 批量文本向量化
     */
    public async embedDocuments(documents: string[]): Promise<number[][]> {
        return Promise.all(documents.map(doc => this.embedQuery(doc)));
    }

    /**
     * 單一文本向量化
     * 根據文本字串長度與字元碼產生標準化之偽向量
     */
    public async embedQuery(document: string): Promise<number[]> {
        this.queriedTexts.push(document);

        const vector = new Array(this.dimension).fill(0);
        let hash = 0;
        for (let i = 0; i < document.length; i++) {
            hash = (hash << 5) - hash + document.charCodeAt(i);
            hash |= 0;
        }

        for (let i = 0; i < this.dimension; i++) {
            vector[i] = Math.sin(hash + i);
        }

        return vector;
    }

    /**
     * 清除查詢歷史記錄
     */
    public reset(): void {
        this.queriedTexts = [];
    }
}
