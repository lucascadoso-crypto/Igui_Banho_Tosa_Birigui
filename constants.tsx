
import { Unit, Client, Pet, Employee, Appointment, Transaction } from './types';

export const UNITS: Unit[] = [
  { id: '1', name: 'Primavera', endereco_completo: 'Rua das Flores, 123' },
  { id: '2', name: 'Birigui', endereco_completo: 'Av. Brasil, 456' },
  { id: '3', name: 'Concórdia', endereco_completo: 'Praça Central, 789' }
];

export const MOCK_CLIENTS: Client[] = [
  { id: 'c1', nome: 'João Silva', telefone: '11 99999-0001', email: 'joao@email.com', unidade_preferencial_id: '1' },
  { id: 'c2', nome: 'Maria Souza', telefone: '11 99999-0002', email: 'maria@email.com', unidade_preferencial_id: '1' },
  { id: 'c3', nome: 'Pedro Santos', telefone: '11 99999-0003', email: 'pedro@email.com', unidade_preferencial_id: '2' },
  { id: 'c4', nome: 'Ana Oliveira', telefone: '11 99999-0004', email: 'ana@email.com', unidade_preferencial_id: '3' }
];

// Fix property names to match Pet interface: name -> nome, breed -> raca, species -> especie, size -> porte
export const MOCK_PETS: Pet[] = [
  { id: 'p1', cliente_id: 'c1', nome: 'Rex', raca: 'Golden Retriever', especie: 'Dog', porte: 'Grande' },
  { id: 'p2', cliente_id: 'c2', nome: 'Luna', raca: 'Persian', especie: 'Cat', porte: 'Médio' },
  { id: 'p3', cliente_id: 'c3', nome: 'Thor', raca: 'Bulldog', especie: 'Dog', porte: 'Médio' },
  { id: 'p4', cliente_id: 'c4', nome: 'Bela', raca: 'Poodle', especie: 'Dog', porte: 'Pequeno' }
];

export const MOCK_EMPLOYEES: Employee[] = [
  { id: 'e1', name: 'Carlos Banho', role: 'Banhista', unitId: '1' },
  { id: 'e2', name: 'Juliana Tosa', role: 'Tosadora', unitId: '1' },
  { id: 'e3', name: 'Marcos Vet', role: 'Veterinário', unitId: '2' },
  { id: 'e4', name: 'Fernanda Recep', role: 'Recepcionista', unitId: '3' }
];

export const MOCK_APPOINTMENTS: Appointment[] = [
  { id: 'a1', pet_id: 'p1', funcionario_id: 'e1', data_agendamento: '2024-05-20', horario_inicio: '10:00', valor_total: 80, status: 'Finalizado', unidade_id: '1' },
  { id: 'a2', pet_id: 'p2', funcionario_id: 'e2', data_agendamento: '2024-05-20', horario_inicio: '14:00', valor_total: 120, status: 'Agendado', unidade_id: '1' },
  { id: 'a3', pet_id: 'p3', funcionario_id: 'e3', data_agendamento: '2024-05-21', horario_inicio: '09:00', valor_total: 200, status: 'Agendado', unidade_id: '2' },
  { id: 'a4', pet_id: 'p4', funcionario_id: 'e1', data_agendamento: '2024-05-22', horario_inicio: '11:00', valor_total: 150, status: 'Agendado', unidade_id: '3' }
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 't1', type: 'Income', amount: 80, date: '2024-05-20', description: 'Serviço Rex', unitId: '1' },
  { id: 't2', type: 'Expense', amount: 500, date: '2024-05-18', description: 'Aluguel Loja', unitId: '1' },
  { id: 't3', type: 'Income', amount: 200, date: '2024-05-21', description: 'Consulta Thor', unitId: '2' },
  { id: 't4', type: 'Expense', amount: 300, date: '2024-05-15', description: 'Produtos de Limpeza', unitId: '3' }
];
