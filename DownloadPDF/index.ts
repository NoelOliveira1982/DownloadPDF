import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { generateAndDownloadPdf } from "./generate-and-download-pdf";

export class DownloadPDF implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    public _container: HTMLDivElement;
    public _notifyOutputChanged: () => void;

    public _htmlContent: string;
    public _pdfFileName: string;
    public _triggerDownload: number;

    public _isProcessing: boolean;
    public _errorMessage: string;

    constructor() {
        this._isProcessing = false;
        this._errorMessage = "";
        this._triggerDownload = 0;
    }

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._container = container;
        this._notifyOutputChanged = notifyOutputChanged;
        this._triggerDownload = context.parameters.triggerDownload.raw || 0;

        const infoDiv = document.createElement("div");
        infoDiv.innerText = "Componente de Geração de PDF (invisível)";
        infoDiv.style.display = "none";
        this._container.appendChild(infoDiv);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        console.log("updateView: Entrou.");

        this._htmlContent = context.parameters.htmlContent.raw || "";
        this._pdfFileName = context.parameters.pdfFileName?.raw || "document.pdf";

        const newTriggerDownload = context.parameters.triggerDownload.raw || 0;
        console.log(`updateView: _triggerDownload antigo: ${this._triggerDownload}, novo: ${newTriggerDownload}`);
        console.log(`updateView: _isProcessing: ${this._isProcessing}`);

        if (this._triggerDownload !== newTriggerDownload && !this._isProcessing) {

            console.log("updateView: Condição de gatilho atendida! Iniciando geração.");
            this._triggerDownload = newTriggerDownload;
            generateAndDownloadPdf(this);
        }
    }

    public getOutputs(): IOutputs {
        return {
            isProcessing: this._isProcessing,
            errorMessage: this._errorMessage
        };
    }

    public destroy(): void {
        // Add code to cleanup control if necessary
    }
}