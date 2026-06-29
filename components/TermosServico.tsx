
import React from 'react';

const BRAND_GREEN = '#0F6E56';

const SECOES = [
  {
    titulo: 'Horários de entrega e retirada',
    texto: 'Pedimos que o pet seja entregue e retirado nos horários combinados. Caso a retirada ultrapasse muito o horário informado, sem aviso prévio, poderá ser cobrada uma taxa adicional de permanência, conforme avaliação da unidade.'
  },
  {
    titulo: 'Pagamento',
    texto: 'Os serviços avulsos devem ser pagos conforme combinado no atendimento. Nos pacotes, o pagamento deverá ser concluído, no máximo, até o segundo banho, salvo condição diferente acordada no momento da contratação.'
  },
  {
    titulo: 'Condições de saúde e comportamento',
    texto: 'O tutor deve informar previamente qualquer alergia, sensibilidade, doença, machucado, limitação física, uso de medicamento ou comportamento que exija atenção especial durante o atendimento.'
  },
  {
    titulo: 'Machucados ou alterações identificadas',
    texto: 'Caso seja identificado algum machucado, irritação, alteração na pele ou outra condição relevante antes ou durante o atendimento, o tutor será informado. Quando necessário, poderemos enviar fotos pelo WhatsApp para registro e confirmação.'
  },
  {
    titulo: 'Acompanhamento veterinário',
    texto: 'Em situações que exijam avaliação profissional, contamos com acompanhamento veterinário. Caso seja necessário, a veterinária poderá entrar em contato com o tutor para orientar os próximos cuidados.'
  },
  {
    titulo: 'Segurança e bem-estar do pet',
    texto: 'Nosso compromisso é realizar o atendimento com cuidado, respeito e segurança. Caso o pet apresente sinais de desconforto, estresse intenso ou qualquer condição que impeça a continuidade segura do serviço, o atendimento poderá ser interrompido e o tutor será comunicado.'
  }
];

const TermosServico: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-6 pt-10 pb-6 flex flex-col items-center text-center border-b border-slate-100">
        <div className="w-14 h-14 rounded-3xl flex items-center justify-center mb-4" style={{ backgroundColor: BRAND_GREEN }}>
          <i className="fa-solid fa-paw text-xl text-white"></i>
        </div>
        <h1 className="text-lg font-black text-slate-800">Termos de Serviço</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Banho e Tosa</p>
      </div>

      <div className="flex-1 px-6 py-8 max-w-xl w-full mx-auto space-y-6">
        <p className="text-sm font-medium text-slate-600 leading-relaxed">
          Ao contratar nossos serviços, o tutor declara estar de acordo com as condições abaixo:
        </p>

        {SECOES.map((secao, i) => (
          <div key={i} className="space-y-1.5">
            <h2 className="text-sm font-black text-slate-800">{i + 1}. {secao.titulo}</h2>
            <p className="text-sm font-medium text-slate-600 leading-relaxed">{secao.texto}</p>
          </div>
        ))}

        <p className="text-sm font-bold text-slate-700 leading-relaxed pt-4 border-t border-slate-100">
          Ao prosseguir com o agendamento, o tutor confirma que as informações fornecidas sobre o pet são verdadeiras e que está de acordo com estes termos.
        </p>
      </div>
    </div>
  );
};

export default TermosServico;
