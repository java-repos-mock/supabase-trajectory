import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react'

import { useCSVImport, CSVParseResult } from 'hooks/misc/useCSVImport'
import {
  Button,
  Modal,
  Input,
  Label,
  Alert,
  Progress,
  ScrollArea,
} from 'ui'

export interface CSVImportModalProps {
  visible: boolean
  tableId: number
  tableName: string
  schema: string
  onClose: () => void
  onImported?: () => void
}

type Step = 'upload' | 'preview' | 'importing' | 'complete'

/**
 * Modal for importing CSV data into a table.
 * 
 * Provides a step-by-step wizard for uploading, previewing,
 * and importing CSV data with type detection and validation.
 */
export function CSVImportModal({
  visible,
  tableId,
  tableName,
  schema,
  onClose,
  onImported,
}: CSVImportModalProps) {
  const { parseCSV, importData, isParsing, isImporting, progress } = useCSVImport()
  
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file')
      return
    }

    setFile(selectedFile)
    setError(null)

    // Parse the file
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        const result = parseCSV(content)
        setParseResult(result)
        setStep('preview')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV')
      }
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(selectedFile)
  }, [parseCSV])

  const handleImport = useCallback(async () => {
    if (!parseResult) return

    setStep('importing')
    
    try {
      await importData(parseResult, {
        tableName,
        schema,
        tableId,
      })
      setStep('complete')
      onImported?.()
    } catch {
      setStep('preview')
    }
  }, [parseResult, importData, tableName, schema, tableId, onImported])

  const handleClose = () => {
    setStep('upload')
    setFile(null)
    setParseResult(null)
    setError(null)
    onClose()
  }

  const renderUploadStep = () => (
    <div className="space-y-4 py-4">
      <div 
        className="border-2 border-dashed border-default rounded-lg p-8 text-center hover:border-foreground-light transition-colors cursor-pointer"
        onClick={() => document.getElementById('csv-file-input')?.click()}
      >
        <Upload className="mx-auto h-12 w-12 text-foreground-light" />
        <p className="mt-2 text-sm text-foreground-light">
          Click to upload or drag and drop
        </p>
        <p className="text-xs text-foreground-lighter mt-1">
          CSV files only
        </p>
        <input
          id="csv-file-input"
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </Alert>
      )}
    </div>
  )

  const renderPreviewStep = () => (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-2 text-sm">
        <FileSpreadsheet size={16} className="text-foreground-light" />
        <span className="font-medium">{file?.name}</span>
        <span className="text-foreground-light">
          ({parseResult?.rowCount} rows, {parseResult?.columns.length} columns)
        </span>
      </div>

      <div className="rounded border border-default overflow-hidden">
        <div className="bg-surface-100 px-3 py-2 border-b border-default">
          <p className="text-xs font-medium">Data Preview (first 5 rows)</p>
        </div>
        <ScrollArea className="h-48">
          <table className="w-full text-xs">
            <thead className="bg-surface-100 sticky top-0">
              <tr>
                {parseResult?.headers.map((header, idx) => (
                  <th key={idx} className="px-3 py-2 text-left font-medium border-r border-default last:border-r-0">
                    {header}
                    <span className="ml-1 text-foreground-lighter">
                      ({parseResult.columns[idx]?.type})
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parseResult?.rows.slice(0, 5).map((row, rowIdx) => (
                <tr key={rowIdx} className="border-t border-default">
                  {parseResult.headers.map((header, colIdx) => (
                    <td key={colIdx} className="px-3 py-2 border-r border-default last:border-r-0 truncate max-w-[200px]">
                      {formatPreviewValue(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <div>
          <p className="font-medium">Ready to import</p>
          <p className="text-sm text-foreground-light">
            {parseResult?.rowCount} rows will be inserted into{' '}
            <code className="text-xs bg-surface-200 px-1 py-0.5 rounded">{schema}.{tableName}</code>
          </p>
        </div>
      </Alert>
    </div>
  )

  const renderImportingStep = () => (
    <div className="space-y-4 py-8 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium">Importing data...</p>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-foreground-light">{progress}% complete</p>
      </div>
    </div>
  )

  const renderCompleteStep = () => (
    <div className="space-y-4 py-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-brand" />
      <div>
        <p className="text-sm font-medium">Import Complete</p>
        <p className="text-xs text-foreground-light mt-1">
          Successfully imported {parseResult?.rowCount} rows
        </p>
      </div>
    </div>
  )

  const formatPreviewValue = (value: any): string => {
    if (value === null || value === undefined) return '(null)'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  return (
    <Modal
      visible={visible}
      onCancel={handleClose}
      header={`Import CSV to ${schema}.${tableName}`}
      size="large"
      customFooter={
        <div className="flex items-center justify-end gap-2">
          <Button type="default" onClick={handleClose} disabled={isImporting}>
            {step === 'complete' ? 'Close' : 'Cancel'}
          </Button>
          {step === 'preview' && (
            <Button
              type="primary"
              onClick={handleImport}
              loading={isImporting}
            >
              Import {parseResult?.rowCount} Rows
            </Button>
          )}
        </div>
      }
    >
      {step === 'upload' && renderUploadStep()}
      {step === 'preview' && renderPreviewStep()}
      {step === 'importing' && renderImportingStep()}
      {step === 'complete' && renderCompleteStep()}
    </Modal>
  )
}
