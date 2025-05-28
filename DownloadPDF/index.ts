import html2canvas from "html2canvas";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { jsPDF } from 'jspdf';
// import html2canvas from 'html2canvas';

export class DownloadPDF implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _notifyOutputChanged: () => void;

    // Propriedades de Entrada
    private _htmlContent: string;
    private _pdfFileName: string;
    private _triggerDownload: number;

    // Propriedades de Saída (estado interno)
    private _isProcessing: boolean;
    private _errorMessage: string;

    constructor() {
        this._isProcessing = false;
        this._errorMessage = "";
        this._triggerDownload = 0; // Inicializar para garantir que a primeira comparação funcione
    }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._container = container;
        this._notifyOutputChanged = notifyOutputChanged;

        const infoDiv = document.createElement("div");
        infoDiv.innerText = "Componente de Geração de PDF (invisível)";
        infoDiv.style.display = "none";
        this._container.appendChild(infoDiv);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        console.log("updateView: Entrou.");

        this._htmlContent = context.parameters.htmlContent.raw || "";
        this._pdfFileName = context.parameters.pdfFileName?.raw || "documento.pdf";
        const newTriggerDownload = context.parameters.triggerDownload.raw || 0;

        console.log(`updateView: _triggerDownload antigo: ${this._triggerDownload}, novo: ${newTriggerDownload}`);
        console.log(`updateView: _isProcessing: ${this._isProcessing}`);

        // VERIFICAÇÃO PARA DISPARAR O DOWNLOAD
        // A geração do PDF só acontece se:
        // a) O valor do gatilho mudou (indicando um novo pedido)
        // b) O componente NÃO está atualmente processando um PDF (evita múltiplas gerações)
        if (newTriggerDownload !== this._triggerDownload && !this._isProcessing) {
            console.log("updateView: Condição de gatilho atendida! Iniciando geração.");

            // ATUALIZA O ESTADO INTERNO DO GATILHO PARA O NOVO VALOR
            // Isso é crucial para que a próxima mudança seja detectada.
            this._triggerDownload = newTriggerDownload;

            // CHAMA A FUNÇÃO DE GERAÇÃO (marcada como async)
            this.generateAndDownloadPdf();
        } else {
            console.log("updateView: Condição de gatilho não atendida.");
        }
    }

    private async generateAndDownloadPdf(): Promise<void> {
        this._isProcessing = true;
        this._errorMessage = "";
        this._notifyOutputChanged();

        const tempElement = document.createElement('div');
        tempElement.innerHTML = this._htmlContent;
        tempElement.style.position = 'absolute';
        tempElement.style.left = '-9999px';
        tempElement.style.top = '-9999px';
        tempElement.style.width = '190mm'; // Definir largura para o html2canvas
        document.body.appendChild(tempElement);

        try {
            if (!this._htmlContent) {
                this._errorMessage = "Conteúdo HTML para PDF não fornecido.";
                this._isProcessing = false;
                this._notifyOutputChanged();
                return;
            }

            const canvas = await html2canvas(tempElement);
            const doc = new jsPDF('p', 'mm', 'a4');
            const margin = 10;
            const headerHeight = 15;
            const footerHeight = 15;

            const pageHeight = doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;
            const usablePageHeight = pageHeight - (2 * margin) - headerHeight - footerHeight;
            const usablePageWidth = pageWidth - (2 * margin);

            // A imagem original do canvas em pixels
            const originalCanvasWidthPx = canvas.width;
            const originalCanvasHeightPx = canvas.height;

            // Calcula a altura da imagem no PDF mantendo a proporção com a largura utilizável
            const imgHeightInPdf = (originalCanvasHeightPx * usablePageWidth) / originalCanvasWidthPx;

            let currentPdfYPositionPx = 0; // Posição Y na imagem original (em PIXELS) que já foi renderizada
            let currentPage = 1;

            while (currentPdfYPositionPx < originalCanvasHeightPx) {
                if (currentPage > 1) {
                    doc.addPage();
                }

                // Altura do pedaço do canvas original que irá para esta página (em PIXELS)
                let sliceHeightPx = (usablePageHeight / imgHeightInPdf) * originalCanvasHeightPx;

                // Se o conteúdo restante for menor que a altura do slice, ajusta
                if (currentPdfYPositionPx + sliceHeightPx > originalCanvasHeightPx) {
                    sliceHeightPx = originalCanvasHeightPx - currentPdfYPositionPx;
                }

                // Cria um novo canvas temporário para o slice
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = originalCanvasWidthPx; // Largura total
                tempCanvas.height = sliceHeightPx;       // Apenas a altura do slice

                const tempContext = tempCanvas.getContext('2d');
                if (!tempContext) {
                    throw new Error("Não foi possível obter o contexto 2D do canvas temporário.");
                }

                // Desenha o pedaço da imagem original no canvas temporário
                tempContext.drawImage(
                    canvas,
                    0, // sX: posição X de origem no canvas original
                    currentPdfYPositionPx, // sY: posição Y de origem no canvas original (onde começamos a cortar)
                    originalCanvasWidthPx, // sWidth: largura do corte no canvas original
                    sliceHeightPx, // sHeight: altura do corte no canvas original
                    0, // dX: posição X de destino no canvas temporário
                    0, // dY: posição Y de destino no canvas temporário
                    originalCanvasWidthPx, // dWidth: largura para desenhar no canvas temporário
                    sliceHeightPx // dHeight: altura para desenhar no canvas temporário
                );

                // Converte o canvas temporário para imgData
                const sliceImgData = tempCanvas.toDataURL('image/jpeg', 1.0) as string;

                // Adiciona o slice do canvas ao PDF
                // Agora w e h são a largura e altura do slice NO PDF (em mm)
                const sliceWidthInPdf = usablePageWidth;
                const sliceHeightInPdf = (sliceHeightPx * sliceWidthInPdf) / originalCanvasWidthPx;


                doc.addImage(
                    sliceImgData,
                    'JPEG',
                    margin,             // Posição X no PDF
                    margin + headerHeight, // Posição Y no PDF
                    sliceWidthInPdf,    // Largura no PDF
                    sliceHeightInPdf,   // Altura no PDF
                    undefined,
                    'FAST',
                    0
                );

                // Adicionar Header (se você tiver _headerText)
                // if (this._headerText) {
                //     doc.text(this._headerText + " - Página " + currentPage, margin, margin + 5);
                // }

                // Adicionar Footer (se você tiver _footerText)
                // if (this._footerText) {
                //     doc.text(this._footerText + " (Página " + currentPage + ")", margin, pageHeight - margin + 5);
                // }

                currentPdfYPositionPx += sliceHeightPx; // Avança a posição na imagem original
                currentPage++;
            }

            doc.save(this._pdfFileName);
            console.log("PDF gerado e download iniciado com sucesso.");

        } catch (error: unknown) {
            console.error("Erro ao gerar ou baixar o PDF:", error);
            if (error instanceof Error) {
                this._errorMessage = `Erro ao gerar PDF: ${error.message}`;
            } else {
                this._errorMessage = `Ocorreu um erro desconhecido: ${String(error)}`;
            }
        } finally {
            if (tempElement.parentNode) {
                tempElement.parentNode.removeChild(tempElement);
            }
            this._isProcessing = false;
            this._notifyOutputChanged();
        }
    }

    public getOutputs(): IOutputs {
        return {
            isProcessing: this._isProcessing,
            errorMessage: this._errorMessage
        };
    }

    public destroy(): void {
        // Adicione código para limpeza se necessário
    }
}