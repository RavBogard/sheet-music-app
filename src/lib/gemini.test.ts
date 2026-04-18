import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Google Generative AI module
const mockGetGenerativeModel = vi.fn().mockReturnValue({ model: 'gemini-3-flash-preview' })
const MockGoogleGenerativeAI = vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
}))

vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: MockGoogleGenerativeAI,
}))

describe('gemini', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        MockGoogleGenerativeAI.mockClear()
        mockGetGenerativeModel.mockClear()
        mockGetGenerativeModel.mockReturnValue({ model: 'gemini-3-flash-preview' })
    })

    it('throws when GOOGLE_GENERATIVE_AI_API_KEY is not set', async () => {
        vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '')
        const { geminiFlash } = await import('./gemini')
        expect(() => geminiFlash()).toThrow('GOOGLE_GENERATIVE_AI_API_KEY is not set')
    })

    it('throws descriptive error when API key is undefined', async () => {
        delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
        const { geminiFlash } = await import('./gemini')
        expect(() => geminiFlash()).toThrow('AI features require a valid Gemini API key')
    })

    it('geminiFlash returns model with correct model name', async () => {
        vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-api-key-123')
        const { geminiFlash } = await import('./gemini')
        const model = geminiFlash()
        expect(model).toBeDefined()
        expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3-flash-preview' })
    })

    it('geminiProVision returns model with correct model name', async () => {
        vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-api-key-123')
        const { geminiProVision } = await import('./gemini')
        const model = geminiProVision()
        expect(model).toBeDefined()
        expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3-flash-preview' })
    })

    it('reuses singleton GoogleGenerativeAI instance', async () => {
        vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-api-key-123')
        const { geminiFlash, geminiProVision } = await import('./gemini')
        geminiFlash()
        geminiProVision()
        // GoogleGenerativeAI should be constructed only once
        expect(MockGoogleGenerativeAI).toHaveBeenCalledTimes(1)
        expect(MockGoogleGenerativeAI).toHaveBeenCalledWith('test-api-key-123')
    })
})
