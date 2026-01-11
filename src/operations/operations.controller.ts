import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OperationsService } from './operations.service';
import { CreateOperationDto } from './dto/create-operation.dto';

@ApiTags('operations')
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create a new operation' })
  @ApiResponse({
    status: 202,
    description: 'Operation created successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Account not found',
  })
  @ApiResponse({
    status: 422,
    description: 'Operation in final state',
  })
  async createOperation(@Body() dto: CreateOperationDto) {
    return await this.operationsService.createOperation(dto);
  }
}
