import jsPDF from "jspdf";
import html2canvas from 'html2canvas';
import { DownloadPDF } from ".";

export async function generateAndDownloadPdf(controller: DownloadPDF): Promise<void> {
  controller._isProcessing = true;
  controller._errorMessage = "";
  controller._notifyOutputChanged();

  const tempElement = createTempElement(controller);

  try {
    if (!controller._htmlContent) {
      controller._errorMessage = "Conteúdo HTML para PDF não fornecido.";
      controller._isProcessing = false;
      controller._notifyOutputChanged();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 50)); // REMOVER DEPOIS

    const canvas = await html2canvas(tempElement);
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 10;
    const headerHeight = 15;
    const footerHeight = 15;

    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const usablePageHeight = pageHeight - (2 * margin) - headerHeight - footerHeight;
    const usablePageWidth = pageWidth - (2 * margin);

    const originalCanvasWidthPx = canvas.width;
    const originalCanvasHeightPx = canvas.height;

    const imgHeightInPdf = (originalCanvasHeightPx * usablePageWidth) / originalCanvasWidthPx;

    let currentPdfYPositionPx = 0;
    let currentPage = 1;

    const sections = Array.from(tempElement.querySelectorAll('.pdf-section'));
    interface SectionInfo {
      element: Element;
      offsetTopPx: number;
      offsetHeightPx: number;
    }
    const sectionInfos: SectionInfo[] = sections.map(sec => ({
      element: sec,
      offsetTopPx: (sec as HTMLElement).getBoundingClientRect().top - (tempElement as HTMLElement).getBoundingClientRect().top,
      offsetHeightPx: (sec as HTMLElement).offsetHeight
    }));

    while (currentPdfYPositionPx < originalCanvasHeightPx) {
      if (currentPage > 1) {
        doc.addPage();
      }

      const yPosOnPage = margin + headerHeight;

      // Altura restante na página atual do PDF (em MM)
      const remainingPageHeightMm = usablePageHeight;

      // Calcule a altura do slice em pixels correspondente à remainingPageHeightMm
      let sliceHeightPx = (remainingPageHeightMm / imgHeightInPdf) * originalCanvasHeightPx;

      const nextSection = sectionInfos.find(
        s => s.offsetTopPx >= currentPdfYPositionPx && s.offsetTopPx < currentPdfYPositionPx + sliceHeightPx + (5 * (canvas.height / imgHeightInPdf)) // Adiciona uma pequena folga para detecção
      );

      if (nextSection) {
        const sectionTopInCurrentSlicePx = nextSection.offsetTopPx - currentPdfYPositionPx;
        const sectionBottomInCurrentSlicePx = sectionTopInCurrentSlicePx + nextSection.offsetHeightPx;

        // Verifica se a seção começa MUITO perto do final da página
        // Ou se a seção inteira não cabe no espaço restante
        const minSpaceForSectionPx = 50; // Pixels mínimos para começar a seção na página
        if (sectionTopInCurrentSlicePx > (sliceHeightPx - minSpaceForSectionPx) || sectionBottomInCurrentSlicePx > sliceHeightPx) {
          // Se a seção não couber ou ficar muito apertada, pular para a próxima página.
          // Isso significa que esta página terá menos conteúdo do que o normal.
          sliceHeightPx = sectionTopInCurrentSlicePx; // Ajusta o slice para ir só até o início da seção
          // console.log(`Quebra de seção forçada antes de ${nextSection.element.tagName}`);
          if (sliceHeightPx <= 0) { // Garante que a fatia tenha pelo menos um tamanho mínimo
            sliceHeightPx = usablePageHeight / imgHeightInPdf * originalCanvasHeightPx * 0.1; // um pedaço pequeno
          }
          // Se o sliceHeightPx se tornar muito pequeno (ex: elemento logo no início da página),
          // pode ser necessário forçar a próxima iteração a adicionar uma página em branco ou mover o elemento inteiro.
        }
      }
      // } // Fim do if (_avoidSectionBreaks)

      // Garante que não excedemos a altura total do canvas
      if (currentPdfYPositionPx + sliceHeightPx > originalCanvasHeightPx) {
        sliceHeightPx = originalCanvasHeightPx - currentPdfYPositionPx;
      }

      // Cria um novo canvas temporário para o slice
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = originalCanvasWidthPx;
      tempCanvas.height = sliceHeightPx;

      const tempContext = tempCanvas.getContext('2d');
      if (!tempContext) {
        throw new Error("Não foi possível obter o contexto 2D do canvas temporário.");
      }

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

      const sliceImgData = tempCanvas.toDataURL('image/jpeg', 1.0) as string;

      const sliceWidthInPdf = usablePageWidth;
      const sliceHeightInPdf = (sliceHeightPx * sliceWidthInPdf) / originalCanvasWidthPx;

      doc.addImage(
        sliceImgData,
        'JPEG',
        margin,
        yPosOnPage,
        sliceWidthInPdf,
        sliceHeightInPdf,
        undefined,
        'FAST',
        0
      );

      // Opcional: Adicionar Header e Footer
      // if (controller._headerText) {
      //     doc.text(controller._headerText + " - Página " + currentPage, margin, margin + 5);
      // }
      // if (controller._footerText) {
      //     doc.text(controller._footerText + " (Página " + currentPage + ")", margin, pageHeight - margin + 5);
      // }

      currentPdfYPositionPx += sliceHeightPx; // Avança a posição na imagem original
      currentPage++;
    }

    doc.save(controller._pdfFileName);
    console.log("PDF gerado e download iniciado com sucesso.");

  } catch (error: unknown) {
    console.error("Erro ao gerar ou baixar o PDF:", error);
    if (error instanceof Error) {
      controller._errorMessage = `Erro ao gerar PDF: ${error.message}`;
    } else {
      controller._errorMessage = `Ocorreu um erro desconhecido: ${String(error)}`;
    }
  } finally {
    if (tempElement.parentNode) {
      tempElement.parentNode.removeChild(tempElement);
    }
    controller._isProcessing = false;
    controller._notifyOutputChanged();
  }
}

function createTempElement(controller: DownloadPDF): HTMLElement {
  const tempElement = document.createElement('div');
  tempElement.innerHTML = controller._htmlContent;
  tempElement.style.position = 'absolute';
  tempElement.style.left = '-9999px';
  tempElement.style.top = '-9999px';
  tempElement.style.width = '190mm';
  tempElement.style.minHeight = '1px';
  document.body.appendChild(tempElement);

  return tempElement;
}